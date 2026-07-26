import { Room } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { createClerkClient } from "@clerk/backend";
import Puzzle from "../models/Puzzle.js";
import User from "../models/User.js";
import Match from "../models/Match.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const ROUNDS_PER_MATCH = 5;
const ROUND_TRANSITION_DELAY_MS = 3000;
const K_FACTOR = 32;

class PlayerState extends Schema {
  constructor() {
    super();
    this.ready = false;
    this.score = 0;
    this.lastAnswerCorrect = false;
    this.hasAnsweredThisRound = false;
    this.username = "";
  }
}
type("boolean")(PlayerState.prototype, "ready");
type("number")(PlayerState.prototype, "score");
type("boolean")(PlayerState.prototype, "lastAnswerCorrect");
type("boolean")(PlayerState.prototype, "hasAnsweredThisRound");
type("string")(PlayerState.prototype, "username");

class DuelState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.status = "waiting";
    this.currentRound = 0;
    this.totalRounds = 0;
    this.roundType = "";
    this.roundPrompt = "";
    this.roundSnippet = "";
    this.roundTimeLimitSec = 0;
    this.roundEndsAt = 0;
  }
}
type({ map: PlayerState })(DuelState.prototype, "players");
type("string")(DuelState.prototype, "status");
type("number")(DuelState.prototype, "currentRound");
type("number")(DuelState.prototype, "totalRounds");
type("string")(DuelState.prototype, "roundType");
type("string")(DuelState.prototype, "roundPrompt");
type("string")(DuelState.prototype, "roundSnippet");
type("number")(DuelState.prototype, "roundTimeLimitSec");
type("number")(DuelState.prototype, "roundEndsAt");

export class DuelRoom extends Room {
  maxClients = 2;

  onCreate(options) {
    this.setPrivate(true);
    this.setState(new DuelState());

    this.puzzles = [];
    this.roundIndex = 0;
    this.roundStartTime = 0;
    this.roundTimeoutHandle = null;
    this.transitionTimeoutHandle = null;
    this.sessionUsers = {};
    this.matchRoundsLog = [];
    this.matchEnded = false;

    this.onMessage("ready", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.ready = true;
        this.checkAllReady();
      }
    });

    this.onMessage("submit-answer", (client, data) => {
      this.handleAnswer(client, data);
    });

    this.onMessage("forfeit", async (client) => {
      if (this.state.status !== "in-progress" || this.matchEnded) return;
      console.log(`Player ${client.sessionId} voluntarily forfeited`);
      this.clearAllTimers();
      await this.endMatch(client.sessionId);
    });

    // Lets a client calibrate its local clock against the server's, so a
    // reconnecting (or freshly loading) client can compute an accurate
    // "time remaining" from the synced roundEndsAt instead of guessing.
    this.onMessage("time-sync", (client) => {
      client.send("time-sync-response", { serverTime: Date.now() });
    });
  }

  async onAuth(client, options) {
    const clerkId = options?.clerkId;
    if (!clerkId) {
      throw new Error("Missing clerkId — must be signed in to play");
    }

    let user = await User.findOne({ clerkId });

    if (!user) {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const email = clerkUser.emailAddresses?.[0]?.emailAddress || `${clerkId}@placeholder.com`;
      const username = clerkUser.username || email.split("@")[0];

      user = await User.create({ clerkId, username, email });
      console.log(`Auto-created User for ${username} (${clerkId})`);
    }

    return { userId: user._id.toString(), clerkId, username: user.username, elo: user.elo };
  }

  onJoin(client, options, auth) {
    const player = new PlayerState();
    player.username = auth.username;
    this.state.players.set(client.sessionId, player);

    this.sessionUsers[client.sessionId] = {
      userId: auth.userId,
      clerkId: auth.clerkId,
      username: auth.username,
      elo: auth.elo,
    };

    console.log(`Player ${auth.username} (${client.sessionId}) joined room ${this.roomId}`);

    if (this.state.players.size === this.maxClients) {
      this.lock();
    }
  }

  async checkAllReady() {
    const allReady = [...this.state.players.values()].every((p) => p.ready);
    if (allReady && this.state.players.size === this.maxClients && this.state.status === "waiting") {
      await this.startMatch();
    }
  }

  async startMatch() {
    const fetched = await Puzzle.aggregate([
      { $match: { verified: true } },
      { $sample: { size: ROUNDS_PER_MATCH } },
    ]);

    if (fetched.length === 0) {
      this.broadcast("match-error", { message: "No verified puzzles available" });
      return;
    }

    this.puzzles = fetched;
    this.state.status = "in-progress";
    this.state.totalRounds = this.puzzles.length;
    this.roundIndex = 0;
    this.matchRoundsLog = [];

    this.broadcast("match-start", { totalRounds: this.puzzles.length });
    this.startRound();
  }

  startRound() {
    if (this.state.status !== "in-progress") return;

    const puzzle = this.puzzles[this.roundIndex];

    for (const player of this.state.players.values()) {
      player.hasAnsweredThisRound = false;
    }

    this.roundStartTime = Date.now();
    this.state.currentRound = this.roundIndex + 1;
    this.state.roundType = puzzle.type;
    this.state.roundPrompt = puzzle.prompt;
    this.state.roundSnippet = puzzle.snippet || "";
    this.state.roundTimeLimitSec = puzzle.timeLimitSec;
    this.state.roundEndsAt = this.roundStartTime + puzzle.timeLimitSec * 1000;

    this.roundAnswers = {};

    this.clearRoundTimeout();
    this.roundTimeoutHandle = this.clock.setTimeout(() => {
      this.endRound();
    }, puzzle.timeLimitSec * 1000);
  }

  handleAnswer(client, data) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hasAnsweredThisRound || this.state.status !== "in-progress") return;

    const puzzle = this.puzzles[this.roundIndex];
    const timeTakenMs = Date.now() - this.roundStartTime;
    const correct =
      String(data?.answer).trim().toLowerCase() === String(puzzle.correctAnswer).trim().toLowerCase();

    const points = correct ? Math.max(50, Math.round(1000 - (timeTakenMs / 1000) * 100)) : 0;

    player.hasAnsweredThisRound = true;
    player.lastAnswerCorrect = correct;
    player.score += points;

    this.roundAnswers[client.sessionId] = { answer: data?.answer ?? "", correct, timeTakenMs, points };

    const allAnswered = [...this.state.players.values()].every((p) => p.hasAnsweredThisRound);
    if (allAnswered) {
      this.clearRoundTimeout();
      this.endRound();
    }
  }

  endRound() {
    if (this.state.status !== "in-progress") return;

    const puzzle = this.puzzles[this.roundIndex];

    this.matchRoundsLog.push({
      puzzleId: puzzle._id,
      answers: { ...this.roundAnswers },
    });

    this.broadcast("round-end", {
      correctAnswer: puzzle.correctAnswer,
      results: this.roundAnswers,
    });

    this.roundIndex += 1;

    this.clearTransitionTimeout();
    if (this.roundIndex < this.puzzles.length) {
      this.transitionTimeoutHandle = this.clock.setTimeout(() => this.startRound(), ROUND_TRANSITION_DELAY_MS);
    } else {
      this.transitionTimeoutHandle = this.clock.setTimeout(() => this.endMatch(), ROUND_TRANSITION_DELAY_MS);
    }
  }

  async endMatch(forfeitedBySessionId = null) {
    if (this.matchEnded) return;

    const allKnownSessionIds = Object.keys(this.sessionUsers);
    if (allKnownSessionIds.length < 2) {
      this.matchEnded = true;
      this.state.status = "completed";
      return;
    }

    this.matchEnded = true;
    this.state.status = "completed";

    const [sidA, sidB] = allKnownSessionIds;
    const scoreA = this.state.players.get(sidA)?.score ?? 0;
    const scoreB = this.state.players.get(sidB)?.score ?? 0;
    const userA = this.sessionUsers[sidA];
    const userB = this.sessionUsers[sidB];

    if (!userA || !userB) {
      console.error("endMatch: missing sessionUsers entry, skipping persistence");
      this.broadcast("match-end", { scores: { [sidA]: scoreA, [sidB]: scoreB }, winnerSessionId: null, eloChange: {} });
      return;
    }

    let winnerSessionId = null;
    let actualA = 0.5;
    let actualB = 0.5;

    if (forfeitedBySessionId) {
      winnerSessionId = forfeitedBySessionId === sidA ? sidB : sidA;
      actualA = winnerSessionId === sidA ? 1 : 0;
      actualB = winnerSessionId === sidB ? 1 : 0;
    } else if (scoreA > scoreB) {
      winnerSessionId = sidA;
      actualA = 1;
      actualB = 0;
    } else if (scoreB > scoreA) {
      winnerSessionId = sidB;
      actualA = 0;
      actualB = 1;
    }

    const expectedA = 1 / (1 + Math.pow(10, (userB.elo - userA.elo) / 400));
    const expectedB = 1 - expectedA;

    const newEloA = Math.round(userA.elo + K_FACTOR * (actualA - expectedA));
    const newEloB = Math.round(userB.elo + K_FACTOR * (actualB - expectedB));

    const eloChange = {
      [sidA]: newEloA - userA.elo,
      [sidB]: newEloB - userB.elo,
    };

    try {
      await User.findByIdAndUpdate(userA.userId, {
        elo: newEloA,
        $inc: { matchesPlayed: 1, wins: winnerSessionId === sidA ? 1 : 0 },
      });
      await User.findByIdAndUpdate(userB.userId, {
        elo: newEloB,
        $inc: { matchesPlayed: 1, wins: winnerSessionId === sidB ? 1 : 0 },
      });

      await Match.create({
        players: [userA.userId, userB.userId],
        rounds: this.matchRoundsLog.map((r) => ({
          puzzle: r.puzzleId,
          playerAnswers: Object.entries(r.answers).map(([sessionId, result]) => ({
            user: this.sessionUsers[sessionId]?.userId,
            answer: result.answer,
            correct: result.correct,
            timeTakenMs: result.timeTakenMs,
            points: result.points,
          })),
        })),
        winner: winnerSessionId ? this.sessionUsers[winnerSessionId].userId : null,
        scores: { [userA.userId]: scoreA, [userB.userId]: scoreB },
        eloChange: { [userA.userId]: eloChange[sidA], [userB.userId]: eloChange[sidB] },
        status: forfeitedBySessionId ? "aborted" : "completed",
      });

      console.log(`Match persisted: ${this.roomId}${forfeitedBySessionId ? " (forfeit)" : ""}`);
    } catch (err) {
      console.error("Failed to persist match:", err.message);
    }

    this.broadcast("match-end", {
      scores: { [sidA]: scoreA, [sidB]: scoreB },
      winnerSessionId,
      eloChange,
      forfeited: !!forfeitedBySessionId,
    });
  }

  clearRoundTimeout() {
    if (this.roundTimeoutHandle) {
      this.roundTimeoutHandle.clear();
      this.roundTimeoutHandle = null;
    }
  }

  clearTransitionTimeout() {
    if (this.transitionTimeoutHandle) {
      this.transitionTimeoutHandle.clear();
      this.transitionTimeoutHandle = null;
    }
  }

  clearAllTimers() {
    this.clearRoundTimeout();
    this.clearTransitionTimeout();
  }

  async onLeave(client, code) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const wasIntentional = code === 1000;
    console.log(`Player ${client.sessionId} left room ${this.roomId} (code: ${code})`);

    if (this.state.status !== "in-progress" || wasIntentional) {
      this.state.players.delete(client.sessionId);
      return;
    }

   try {
      await this.allowReconnection(client, 60);
      console.log(`Player ${client.sessionId} reconnected`);
    } catch (e) {
      console.log(`Player ${client.sessionId} did not reconnect in time — forfeiting`);
      this.state.players.delete(client.sessionId);
      this.clearAllTimers();
      await this.endMatch(client.sessionId);
    }
  }

  onDispose() {
    this.clearAllTimers();
    console.log(`Room ${this.roomId} disposed`);
  }
}
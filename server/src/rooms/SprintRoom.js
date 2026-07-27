import { Room } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { createClerkClient } from "@clerk/backend";
import User from "../models/User.js";
import Match from "../models/Match.js";
import { generateQuestion } from "../utils/mathQuestions.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const MATCH_DURATION_MS = 60000;
const QUESTION_TIMEOUT_MS = 10000;
const K_FACTOR = 32;

class SprintPlayerState extends Schema {
  constructor() {
    super();
    this.score = 0;
    this.username = "";
  }
}
type("number")(SprintPlayerState.prototype, "score");
type("string")(SprintPlayerState.prototype, "username");

class SprintState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.status = "waiting"; // waiting -> in-progress -> completed
    this.matchEndsAt = 0;
  }
}
type({ map: SprintPlayerState })(SprintState.prototype, "players");
type("string")(SprintState.prototype, "status");
type("number")(SprintState.prototype, "matchEndsAt");

export class SprintRoom extends Room {
  maxClients = 2;

  onCreate() {
    this.setPrivate(true);
    this.setState(new SprintState());

    this.sessionUsers = {};
    this.currentQuestions = {}; // sessionId -> { answer, sentAt }
    this.questionTimers = {}; // sessionId -> timeout handle
    this.matchTimeoutHandle = null;
    this.matchEnded = false;

    this.onMessage("ready", (client) => {
      console.log(`[Sprint] Received "ready" from ${client.sessionId}, players in room: ${this.state.players.size}`);
      const player = this.state.players.get(client.sessionId);
      if (player) {
        this.checkAllReady();
      } else {
        console.log(`[Sprint] No player state found for ${client.sessionId}`);
      }
    });
  }

  async onAuth(client, options) {
    const clerkId = options?.clerkId;
    if (!clerkId) throw new Error("Missing clerkId — must be signed in to play");

    let user = await User.findOne({ clerkId });
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const email = clerkUser.emailAddresses?.[0]?.emailAddress || `${clerkId}@placeholder.com`;
      const username = clerkUser.username || email.split("@")[0];
      user = await User.create({ clerkId, username, email });
    }

    return { userId: user._id.toString(), clerkId, username: user.username, mathElo: user.mathElo };
  }

  onJoin(client, options, auth) {
    console.log(`[Sprint] onJoin: ${auth.username} (${client.sessionId}), room size will be: ${this.state.players.size + 1}`);
    const player = new SprintPlayerState();
    player.username = auth.username;
    this.state.players.set(client.sessionId, player);

    this.sessionUsers[client.sessionId] = {
      userId: auth.userId,
      clerkId: auth.clerkId,
      username: auth.username,
      mathElo: auth.mathElo,
    };

    if (this.state.players.size === this.maxClients) {
      this.lock();
    }
  }

  checkAllReady() {
    console.log(`[Sprint] checkAllReady: size=${this.state.players.size}, maxClients=${this.maxClients}, status=${this.state.status}`);
    if (this.state.players.size === this.maxClients && this.state.status === "waiting") {
      console.log("[Sprint] Conditions met, starting match");
      this.startMatch();
    }
  }

  startMatch() {
    this.state.status = "in-progress";
    this.state.matchEndsAt = Date.now() + MATCH_DURATION_MS;

    this.broadcast("match-start", { durationMs: MATCH_DURATION_MS });

    for (const client of this.clients) {
      this.sendQuestion(client);
    }

    this.matchTimeoutHandle = this.clock.setTimeout(() => this.endMatch(), MATCH_DURATION_MS);
  }

  sendQuestion(client) {
    if (this.state.status !== "in-progress") return;

    const q = generateQuestion();
    this.currentQuestions[client.sessionId] = { answer: q.answer, sentAt: Date.now() };

    this.clearQuestionTimer(client.sessionId);
    this.questionTimers[client.sessionId] = this.clock.setTimeout(() => {
      client.send("answer-result", { correct: false, skipped: true });
      this.sendQuestion(client);
    }, QUESTION_TIMEOUT_MS);

    client.send("question", { prompt: q.prompt });
  }

  handleAnswer(client, data) {
    if (this.state.status !== "in-progress") return;
    const question = this.currentQuestions[client.sessionId];
    if (!question) return;

    const correct = String(data?.answer).trim() === question.answer;
    const player = this.state.players.get(client.sessionId);

    if (correct && player) {
      player.score += 1;
    }

    client.send("answer-result", { correct, skipped: false });
    this.clearQuestionTimer(client.sessionId);
    this.sendQuestion(client);
  }

  clearQuestionTimer(sessionId) {
    if (this.questionTimers[sessionId]) {
      this.questionTimers[sessionId].clear();
      delete this.questionTimers[sessionId];
    }
  }

  clearAllQuestionTimers() {
    for (const sessionId of Object.keys(this.questionTimers)) {
      this.clearQuestionTimer(sessionId);
    }
  }

  async endMatch() {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.state.status = "completed";
    this.clearAllQuestionTimers();
    if (this.matchTimeoutHandle) this.matchTimeoutHandle.clear();

    const sessionIds = Object.keys(this.sessionUsers);
    if (sessionIds.length < 2) {
      this.broadcast("match-end", { scores: {}, winnerSessionId: null, eloChange: {} });
      return;
    }

    const [sidA, sidB] = sessionIds;
    const scoreA = this.state.players.get(sidA)?.score ?? 0;
    const scoreB = this.state.players.get(sidB)?.score ?? 0;
    const userA = this.sessionUsers[sidA];
    const userB = this.sessionUsers[sidB];

    let winnerSessionId = null;
    let actualA = 0.5;
    let actualB = 0.5;
    if (scoreA > scoreB) {
      winnerSessionId = sidA;
      actualA = 1;
      actualB = 0;
    } else if (scoreB > scoreA) {
      winnerSessionId = sidB;
      actualA = 0;
      actualB = 1;
    }

    const expectedA = 1 / (1 + Math.pow(10, (userB.mathElo - userA.mathElo) / 400));
    const expectedB = 1 - expectedA;
    const newEloA = Math.round(userA.mathElo + K_FACTOR * (actualA - expectedA));
    const newEloB = Math.round(userB.mathElo + K_FACTOR * (actualB - expectedB));

    const eloChange = { [sidA]: newEloA - userA.mathElo, [sidB]: newEloB - userB.mathElo };

    try {
      await User.findByIdAndUpdate(userA.userId, {
        mathElo: newEloA,
        $inc: { sprintMatchesPlayed: 1, sprintWins: winnerSessionId === sidA ? 1 : 0 },
      });
      await User.findByIdAndUpdate(userB.userId, {
        mathElo: newEloB,
        $inc: { sprintMatchesPlayed: 1, sprintWins: winnerSessionId === sidB ? 1 : 0 },
      });

      await Match.create({
        mode: "sprint",
        players: [userA.userId, userB.userId],
        rounds: [],
        winner: winnerSessionId ? this.sessionUsers[winnerSessionId].userId : null,
        scores: { [userA.userId]: scoreA, [userB.userId]: scoreB },
        eloChange: { [userA.userId]: eloChange[sidA], [userB.userId]: eloChange[sidB] },
        status: "completed",
      });
    } catch (err) {
      console.error("Failed to persist sprint match:", err.message);
    }

    this.broadcast("match-end", {
      scores: { [sidA]: scoreA, [sidB]: scoreB },
      winnerSessionId,
      eloChange,
    });
  }

  onLeave(client) {
    this.clearQuestionTimer(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.status === "in-progress" && !this.matchEnded) {
      this.endMatch();
    }
  }

  onDispose() {
    this.clearAllQuestionTimers();
    if (this.matchTimeoutHandle) this.matchTimeoutHandle.clear();
  }
}
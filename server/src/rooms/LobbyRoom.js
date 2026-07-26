import { Room } from "colyseus";
import { Schema, type } from "@colyseus/schema";
import { matchMaker } from "@colyseus/core";
import { createClerkClient } from "@clerk/backend";
import User from "../models/User.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const BASE_ELO_RANGE = 100;
const ELO_RANGE_GROWTH_PER_SEC = 20;
const MATCH_CHECK_INTERVAL_MS = 1500;
const recentJoinAttempts = new Map(); // clerkId -> last join timestamp
const JOIN_COOLDOWN_MS = 500;

class LobbyState extends Schema {
  constructor() {
    super();
    this.waitingCount = 0;
  }
}
type("number")(LobbyState.prototype, "waitingCount");

export class LobbyRoom extends Room {
  onCreate() {
    this.setState(new LobbyState());
    this.queue = []; // { sessionId, client, userId, clerkId, username, elo, joinedAt }

    this.matchCheckInterval = this.clock.setInterval(() => {
      this.tryMatchPlayers();
    }, MATCH_CHECK_INTERVAL_MS);

    this.onMessage("cancel-search", (client) => {
      this.queue = this.queue.filter((p) => p.sessionId !== client.sessionId);
      this.state.waitingCount = this.queue.length;
      console.log(`${client.sessionId} cancelled search`);
      client.leave();
    });
  }

 async onAuth(client, options) {
    const clerkId = options?.clerkId;
    if (!clerkId) throw new Error("Missing clerkId — must be signed in to queue");

    const lastAttempt = recentJoinAttempts.get(clerkId);
    if (lastAttempt && Date.now() - lastAttempt < JOIN_COOLDOWN_MS) {
      throw new Error("Joining too frequently — please wait a moment");
    }
    recentJoinAttempts.set(clerkId, Date.now());

    let user = await User.findOne({ clerkId });
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const email = clerkUser.emailAddresses?.[0]?.emailAddress || `${clerkId}@placeholder.com`;
      const username = clerkUser.username || email.split("@")[0];
      user = await User.create({ clerkId, username, email });
    }

    return { userId: user._id.toString(), clerkId, username: user.username, elo: user.elo };
  }

  onJoin(client, options, auth) {
    this.queue.push({
      sessionId: client.sessionId,
      client,
      userId: auth.userId,
      clerkId: auth.clerkId,
      username: auth.username,
      elo: auth.elo,
      joinedAt: Date.now(),
    });
    this.state.waitingCount = this.queue.length;
    console.log(`${auth.username} joined matchmaking queue (ELO ${auth.elo})`);
    this.tryMatchPlayers();
  }

  async tryMatchPlayers() {
    if (this.queue.length < 2) return;

    const sorted = [...this.queue].sort((a, b) => a.elo - b.elo);

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const waitedSec = (Date.now() - Math.min(a.joinedAt, b.joinedAt)) / 1000;
      const allowedRange = BASE_ELO_RANGE + waitedSec * ELO_RANGE_GROWTH_PER_SEC;

      if (Math.abs(a.elo - b.elo) <= allowedRange) {
        await this.pairPlayers(a, b);
        return; // remaining queue gets re-evaluated on the next tick
      }
    }
  }

  async pairPlayers(a, b) {
    this.queue = this.queue.filter((p) => p.sessionId !== a.sessionId && p.sessionId !== b.sessionId);
    this.state.waitingCount = this.queue.length;

    try {
      const room = await matchMaker.createRoom("duel", {});

      const reservationA = await matchMaker.reserveSeatFor(room, { clerkId: a.clerkId });
      const reservationB = await matchMaker.reserveSeatFor(room, { clerkId: b.clerkId });

      a.client.send("match-found", { reservation: reservationA });
      b.client.send("match-found", { reservation: reservationB });

      console.log(`Paired ${a.username} (${a.elo}) vs ${b.username} (${b.elo}) -> room ${room.roomId}`);
    } catch (err) {
      console.error("Failed to create duel room for matched players:", err.message);
      this.queue.push(a, b);
      this.state.waitingCount = this.queue.length;
    }
  }

  onLeave(client) {
    this.queue = this.queue.filter((p) => p.sessionId !== client.sessionId);
    this.state.waitingCount = this.queue.length;
  }

  onDispose() {
    if (this.matchCheckInterval) this.matchCheckInterval.clear();
  }
}
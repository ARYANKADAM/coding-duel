import { Room } from "colyseus";
import { Schema, type } from "@colyseus/schema";
import { matchMaker } from "@colyseus/core";
import { createClerkClient } from "@clerk/backend";
import User from "../models/User.js";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const BASE_ELO_RANGE = 100;
const ELO_RANGE_GROWTH_PER_SEC = 20;
const MATCH_CHECK_INTERVAL_MS = 1500;

class SprintLobbyState extends Schema {
  constructor() {
    super();
    this.waitingCount = 0;
  }
}
type("number")(SprintLobbyState.prototype, "waitingCount");

export class SprintLobbyRoom extends Room {
  onCreate() {
    this.setState(new SprintLobbyState());
    this.queue = [];
    this.matchCheckInterval = this.clock.setInterval(() => this.tryMatchPlayers(), MATCH_CHECK_INTERVAL_MS);

    // Add it right here:
    this.onMessage("cancel-search", (client) => {
      this.queue = this.queue.filter((p) => p.sessionId !== client.sessionId);
      this.state.waitingCount = this.queue.length;
      client.leave();
    });

  async onAuth(client, options) {
    const clerkId = options?.clerkId;
    if (!clerkId) throw new Error("Missing clerkId — must be signed in to queue");

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
    this.queue.push({
      sessionId: client.sessionId,
      client,
      clerkId: auth.clerkId,
      username: auth.username,
      mathElo: auth.mathElo,
      joinedAt: Date.now(),
    });
    this.state.waitingCount = this.queue.length;
    this.tryMatchPlayers();
  }

  async tryMatchPlayers() {
    if (this.queue.length < 2) return;
    const sorted = [...this.queue].sort((a, b) => a.mathElo - b.mathElo);

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const waitedSec = (Date.now() - Math.min(a.joinedAt, b.joinedAt)) / 1000;
      const allowedRange = BASE_ELO_RANGE + waitedSec * ELO_RANGE_GROWTH_PER_SEC;

      if (Math.abs(a.mathElo - b.mathElo) <= allowedRange) {
        await this.pairPlayers(a, b);
        return;
      }
    }
  }

  async pairPlayers(a, b) {
    this.queue = this.queue.filter((p) => p.sessionId !== a.sessionId && p.sessionId !== b.sessionId);
    this.state.waitingCount = this.queue.length;

    try {
      const room = await matchMaker.createRoom("sprint", {});
      const reservationA = await matchMaker.reserveSeatFor(room, { clerkId: a.clerkId });
      const reservationB = await matchMaker.reserveSeatFor(room, { clerkId: b.clerkId });
      a.client.send("match-found", { reservation: reservationA });
      b.client.send("match-found", { reservation: reservationB });
    } catch (err) {
      console.error("Failed to create sprint room:", err.message);
      this.queue.push(a, b);
      this.state.waitingCount = this.queue.length;
    }
  }

  onMessage(type, callback) {
    super.onMessage(type, callback);
  }

  onLeave(client) {
    this.queue = this.queue.filter((p) => p.sessionId !== client.sessionId);
    this.state.waitingCount = this.queue.length;
  }

  onDispose() {
    if (this.matchCheckInterval) this.matchCheckInterval.clear();
  }
}
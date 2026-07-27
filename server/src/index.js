import { defineServer, defineRoom } from "colyseus";
import { matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import { DuelRoom } from "./rooms/DuelRoom.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import dotenv from "dotenv";
import * as Sentry from "@sentry/node";


dotenv.config();

const PORT = Number(process.env.PORT) || 2567;
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

async function main() {
  await connectDB();
  console.log("Connected to MongoDB");

  const server = defineServer({
    transport: new WebSocketTransport({}),
    rooms: {
      duel: defineRoom(DuelRoom),
      lobby: defineRoom(LobbyRoom),
    },
    express: (app) => {
      app.use(
        cors({
          origin: allowedOrigins,
          credentials: true,
        })
      );
      app.use(express.json());

      app.get("/health", (req, res) => {
        if (req.query.crash) {
          throw new Error("Deliberate test crash for Sentry verification");
        }
        res.json({ status: "ok", rooms: "duel, lobby" });
      });

      // Must be registered AFTER all routes — this is what actually lets
      // Sentry capture errors thrown inside Express route handlers, since
      // Express catches those internally before they'd ever reach a
      // global uncaughtException listener.
      Sentry.setupExpressErrorHandler(app);
    },
  });

  // Supplemental fix: /matchmake/reconnect/* (and potentially other
  // internal matchmaking endpoints) don't reliably route through the
  // Express app configured above — this explicitly sets CORS headers at
  // Colyseus's own matchmaking controller level as a direct override.
  matchMaker.controller.getCorsHeaders = function (req) {
    const origin = req?.headers?.origin;
    const isAllowed = origin && allowedOrigins.includes(origin);
    return {
      "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
      Vary: "Origin",
    };
  };

  server.listen(PORT);
  console.log(`Colyseus server running on ws://localhost:${PORT}`);
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  Sentry.captureException(err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  Sentry.captureException(err);
});

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
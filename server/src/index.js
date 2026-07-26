import { defineServer, defineRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./lib/db.js";
import { DuelRoom } from "./rooms/DuelRoom.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 2567;

async function main() {
  await connectDB();
  console.log("Connected to MongoDB");

  const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

  const server = defineServer({
    transport: new WebSocketTransport({}),
    rooms: {
      duel: defineRoom(DuelRoom),
      lobby: defineRoom(LobbyRoom),
    },
    express: (app) => {
      app.use(
        cors({
          origin: process.env.CLIENT_URL || "http://localhost:3000",
          credentials: true,
        })
      );
      app.use(express.json());

      app.get("/health", (req, res) => {
        res.json({ status: "ok", rooms: "duel, lobby" });
      });
    },
  });

  server.listen(PORT);
  console.log(`Colyseus server running on ws://localhost:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
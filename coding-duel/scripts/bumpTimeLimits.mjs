import mongoose from "mongoose";
import { config } from "dotenv";
import Puzzle from "../models/Puzzle.js";

config({ path: ".env.local" });

async function bump() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await Puzzle.updateMany({}, { $set: { timeLimitSec: 30 } });
  console.log(`Updated ${result.modifiedCount} puzzles to 30s time limit`);

  process.exit(0);
}

bump().catch((err) => {
  console.error("Bump failed:", err.message);
  process.exit(1);
});
import mongoose from "mongoose";

const PuzzleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["predict-output", "spot-bug", "regex-match", "sql-output", "time-complexity"],
      required: true,
    },
    language: { type: String, default: "javascript" },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "easy" },
    prompt: { type: String, required: true },
    snippet: { type: String },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    timeLimitSec: { type: Number, default: 10 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Puzzle || mongoose.model("Puzzle", PuzzleSchema);
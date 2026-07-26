import mongoose from "mongoose";

const RoundResultSchema = new mongoose.Schema(
  {
    puzzle: { type: mongoose.Schema.Types.ObjectId, ref: "Puzzle" },
    playerAnswers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        answer: String,
        correct: Boolean,
        timeTakenMs: Number,
        points: Number,
      },
    ],
  },
  { _id: false }
);

const MatchSchema = new mongoose.Schema(
  {
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    rounds: [RoundResultSchema],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    scores: { type: Map, of: Number },
    eloChange: { type: Map, of: Number },
    status: { type: String, enum: ["in-progress", "completed", "aborted"], default: "in-progress" },
  },
  { timestamps: true }
);

export default mongoose.models.Match || mongoose.model("Match", MatchSchema);
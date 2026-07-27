import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    elo: { type: Number, default: 1000 },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    mathElo: { type: Number, default: 1000 },
    sprintMatchesPlayed: { type: Number, default: 0 },
    sprintWins: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
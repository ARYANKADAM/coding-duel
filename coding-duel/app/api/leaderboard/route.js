import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function GET(req) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();

  const query = search ? { username: { $regex: search, $options: "i" } } : {};

  const topUsers = await User.find(query)
    .sort({ elo: -1 })
    .limit(50)
    .select("clerkId username elo matchesPlayed wins")
    .lean();

  return Response.json({ leaderboard: topUsers });
}
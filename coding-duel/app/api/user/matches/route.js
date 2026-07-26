import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Match from "@/models/Match";

export async function GET(req) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = 10;
  const skip = (page - 1) * limit;

  await connectDB();
  const user = await User.findOne({ clerkId: userId }).lean();
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const [matches, total] = await Promise.all([
    Match.find({ players: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("players", "username")
      .populate("winner", "username")
      .lean(),
    Match.countDocuments({ players: user._id }),
  ]);

  return Response.json({
    matches,
    userId: user._id.toString(),
    page,
    totalPages: Math.ceil(total / limit),
    total,
  });
}
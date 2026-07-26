import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Puzzle from "@/models/Puzzle";

async function requireAdmin(userId) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata?.role === "admin";
}

export async function PATCH(req, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await requireAdmin(userId);
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "type", "language", "difficulty", "prompt",
    "snippet", "correctAnswer", "timeLimitSec", "verified",
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  await connectDB();
  const puzzle = await Puzzle.findByIdAndUpdate(id, updates, { new: true });

  if (!puzzle) return Response.json({ error: "Puzzle not found" }, { status: 404 });

  return Response.json({ puzzle });
}

export async function DELETE(req, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await requireAdmin(userId);
  if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await connectDB();
  const puzzle = await Puzzle.findByIdAndDelete(id);

  if (!puzzle) return Response.json({ error: "Puzzle not found" }, { status: 404 });

  return Response.json({ success: true });
}
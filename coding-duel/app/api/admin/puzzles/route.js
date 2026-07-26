import { auth } from "@clerk/nextjs/server";
import vm from "node:vm";
import { connectDB } from "@/lib/db";
import Puzzle from "@/models/Puzzle";
import { clerkClient } from "@clerk/nextjs/server";

// Runs a JS snippet in a sandboxed context (no require/process/fs access)
// with a hard timeout, capturing console.log output the same way a real
// Node process would. Used to auto-verify predict-output puzzles instead
// of relying on Piston's public API, which stopped being freely available
// to unregistered/individual projects as of Feb 2026.
function runJavaScriptSandboxed(code, timeoutMs = 2000) {
  const capturedLogs = [];

  const sandbox = {
    console: {
      log: (...args) => {
        capturedLogs.push(
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ")
        );
      },
    },
  };

  const context = vm.createContext(sandbox);

  try {
    vm.runInContext(code, context, { timeout: timeoutMs });
    return { success: true, output: capturedLogs.join("\n").trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function requireAdmin(userId) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.publicMetadata?.role === "admin";
}

async function verifyPredictOutput(snippet, language, expectedAnswer) {
  if (language !== "javascript") {
    return {
      verified: false,
      reason: `No local sandbox support for "${language}" yet — needs manual review`,
    };
  }

  const result = runJavaScriptSandboxed(snippet);

  if (!result.success) {
    return { verified: false, reason: `Execution error: ${result.error}` };
  }

  const expected = String(expectedAnswer).trim();
  const matches = result.output === expected;

  return {
    verified: matches,
    actualOutput: result.output,
    reason: matches ? null : `Expected "${expected}" but got "${result.output}"`,
  };
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

   const isAdmin = await requireAdmin(userId);
  if (!isAdmin) {
    return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { type, language, difficulty, prompt, snippet, correctAnswer, timeLimitSec } = body;

  if (!type || !prompt || !correctAnswer) {
    return Response.json({ error: "type, prompt, and correctAnswer are required" }, { status: 400 });
  }

 let verified = false;
  let verificationDetails = null;

  if (type === "predict-output") {
    if (!snippet || !snippet.trim()) {
      verificationDetails = { verified: false, reason: "No code snippet provided — cannot auto-verify" };
    } else {
      const result = await verifyPredictOutput(snippet, language || "javascript", correctAnswer);
      verified = result.verified;
      verificationDetails = result;
    }
  }

  await connectDB();
  const puzzle = await Puzzle.create({
    type,
    language: language || "javascript",
    difficulty: difficulty || "easy",
    prompt,
    snippet: snippet || "",
    correctAnswer,
    timeLimitSec: timeLimitSec || 30,
    verified,
  });

  return Response.json({ puzzle, verificationDetails });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

   const isAdmin = await requireAdmin(userId);
  if (!isAdmin) {
    return Response.json({ error: "Forbidden — admin access required" }, { status: 403 });
  }

  await connectDB();
  const puzzles = await Puzzle.find({}).sort({ createdAt: -1 }).limit(50).lean();
  return Response.json({ puzzles });
}
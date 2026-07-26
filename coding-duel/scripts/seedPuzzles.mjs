import mongoose from "mongoose";
import { config } from "dotenv";
import Puzzle from "../models/Puzzle.js";

config({ path: ".env.local" });

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set — check .env.local");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  await Puzzle.deleteMany({});
await Puzzle.insertMany([
    // predict-output
    {
      type: "predict-output", language: "javascript", difficulty: "easy",
      prompt: "What does this log?",
      snippet: "console.log([1,2,3].map(x => x * 2))",
      correctAnswer: "[2,4,6]", timeLimitSec: 8, verified: true,
    },
    {
      type: "predict-output", language: "javascript", difficulty: "easy",
      prompt: "What does this log?",
      snippet: "console.log(typeof null)",
      correctAnswer: "object", timeLimitSec: 8, verified: true,
    },
    {
      type: "predict-output", language: "javascript", difficulty: "medium",
      prompt: "What does this log?",
      snippet: "console.log(0.1 + 0.2 === 0.3)",
      correctAnswer: "false", timeLimitSec: 10, verified: true,
    },
    {
      type: "predict-output", language: "python", difficulty: "medium",
      prompt: "What does this print?",
      snippet: "print([x for x in range(5) if x % 2 == 0])",
      correctAnswer: "[0, 2, 4]", timeLimitSec: 10, verified: true,
    },

    // spot-bug
    {
      type: "spot-bug", language: "python", difficulty: "easy",
      prompt: "What's wrong with this function?",
      snippet: "def add(a, b):\n    return a - b",
      correctAnswer: "Uses subtraction instead of addition", timeLimitSec: 10, verified: true,
    },
    {
      type: "spot-bug", language: "javascript", difficulty: "easy",
      prompt: "What's wrong with this loop?",
      snippet: "for (let i = 0; i <= arr.length; i++) { console.log(arr[i]); }",
      correctAnswer: "Off-by-one, should be i < arr.length", timeLimitSec: 10, verified: true,
    },
    {
      type: "spot-bug", language: "javascript", difficulty: "medium",
      prompt: "What's wrong with this comparison?",
      snippet: "if (userInput = 5) { console.log('matched'); }",
      correctAnswer: "Uses assignment = instead of comparison ==", timeLimitSec: 10, verified: true,
    },
    {
      type: "spot-bug", language: "python", difficulty: "medium",
      prompt: "What's wrong with this default argument?",
      snippet: "def add_item(item, items=[]):\n    items.append(item)\n    return items",
      correctAnswer: "Mutable default argument shared across calls", timeLimitSec: 12, verified: true,
    },

    // regex-match
    {
      type: "regex-match", language: "javascript", difficulty: "easy",
      prompt: "Does /^\\d{3}-\\d{4}$/ match '555-1234'?",
      snippet: "/^\\d{3}-\\d{4}$/.test('555-1234')",
      correctAnswer: "true", timeLimitSec: 8, verified: true,
    },
    {
      type: "regex-match", language: "javascript", difficulty: "easy",
      prompt: "Does /^[a-z]+$/ match 'Hello'?",
      snippet: "/^[a-z]+$/.test('Hello')",
      correctAnswer: "false", timeLimitSec: 8, verified: true,
    },
    {
      type: "regex-match", language: "javascript", difficulty: "medium",
      prompt: "Does /\\bcat\\b/.test('concatenate') return true or false?",
      snippet: "/\\bcat\\b/.test('concatenate')",
      correctAnswer: "false", timeLimitSec: 10, verified: true,
    },
    {
      type: "regex-match", language: "javascript", difficulty: "medium",
      prompt: "Does /^[\\w.-]+@[\\w.-]+\\.\\w+$/ match 'a@b'?",
      snippet: "/^[\\w.-]+@[\\w.-]+\\.\\w+$/.test('a@b')",
      correctAnswer: "false", timeLimitSec: 10, verified: true,
    },

    // sql-output
    {
      type: "sql-output", language: "sql", difficulty: "easy",
      prompt: "How many rows does this return if users has 5 rows and 2 have age > 18?",
      snippet: "SELECT * FROM users WHERE age > 18;",
      correctAnswer: "2", timeLimitSec: 10, verified: true,
    },
    {
      type: "sql-output", language: "sql", difficulty: "medium",
      prompt: "If orders has 3 rows with amount 10, 20, NULL — what does SUM(amount) return?",
      snippet: "SELECT SUM(amount) FROM orders;",
      correctAnswer: "30", timeLimitSec: 10, verified: true,
    },
    {
      type: "sql-output", language: "sql", difficulty: "medium",
      prompt: "If a table has 4 rows and 1 has a NULL email, how many rows does this return?",
      snippet: "SELECT * FROM users WHERE email IS NOT NULL;",
      correctAnswer: "3", timeLimitSec: 10, verified: true,
    },
    {
      type: "sql-output", language: "sql", difficulty: "hard",
      prompt: "Table has rows (A,1),(A,2),(B,3). What does this return per group?",
      snippet: "SELECT category, COUNT(*) FROM items GROUP BY category;",
      correctAnswer: "A:2, B:1", timeLimitSec: 14, verified: true,
    },

    // time-complexity
    {
      type: "time-complexity", language: "javascript", difficulty: "easy",
      prompt: "What's the time complexity of this loop?",
      snippet: "for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { } }",
      correctAnswer: "O(n^2)", timeLimitSec: 10, verified: true,
    },
    {
      type: "time-complexity", language: "javascript", difficulty: "easy",
      prompt: "What's the time complexity of this loop?",
      snippet: "for (let i = 0; i < n; i++) { console.log(i); }",
      correctAnswer: "O(n)", timeLimitSec: 8, verified: true,
    },
    {
      type: "time-complexity", language: "javascript", difficulty: "medium",
      prompt: "What's the time complexity of binary search?",
      snippet: "function binarySearch(arr, target) { /* halves search space each step */ }",
      correctAnswer: "O(log n)", timeLimitSec: 10, verified: true,
    },
    {
      type: "time-complexity", language: "javascript", difficulty: "hard",
      prompt: "What's the time complexity of this recursive function?",
      snippet: "function fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); }",
      correctAnswer: "O(2^n)", timeLimitSec: 14, verified: true,
    },
  ]);

  console.log("Seeded puzzles");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
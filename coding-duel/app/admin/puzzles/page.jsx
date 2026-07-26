"use client";

import { useEffect, useState } from "react";

const TYPES = ["predict-output", "spot-bug", "regex-match", "sql-output", "time-complexity"];

export default function AdminPuzzlesPage() {
  const [form, setForm] = useState({
    type: "predict-output",
    language: "javascript",
    difficulty: "easy",
    prompt: "",
    snippet: "",
    correctAnswer: "",
    timeLimitSec: 30,
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [puzzles, setPuzzles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  async function loadPuzzles() {
    const res = await fetch("/api/admin/puzzles");
    const data = await res.json();
    setPuzzles(data.puzzles || []);
  }

  useEffect(() => {
    loadPuzzles();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setLastResult(null);

    try {
      const res = await fetch("/api/admin/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setLastResult(data);
      if (data.puzzle) {
        setForm({ ...form, prompt: "", snippet: "", correctAnswer: "" });
        loadPuzzles();
      }
    } catch (err) {
      setLastResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  }

   async function handleApprove(id) {
    await fetch(`/api/admin/puzzles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });
    loadPuzzles();
  }

  async function handleUnapprove(id) {
    await fetch(`/api/admin/puzzles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false }),
    });
    loadPuzzles();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this puzzle permanently?")) return;
    await fetch(`/api/admin/puzzles/${id}`, { method: "DELETE" });
    loadPuzzles();
  }

  function startEdit(p) {
    setEditingId(p._id);
    setEditForm({
      type: p.type,
      language: p.language,
      difficulty: p.difficulty,
      prompt: p.prompt,
      snippet: p.snippet || "",
      correctAnswer: p.correctAnswer,
      timeLimitSec: p.timeLimitSec,
    });
  }

  async function saveEdit(id) {
    await fetch(`/api/admin/puzzles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setEditForm(null);
    loadPuzzles();
  }


  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      <h1 className="text-2xl font-bold mb-8">Add Puzzle</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-12">
        <div className="flex gap-4">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 flex-1"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 flex-1"
          >
            <option value="javascript">javascript</option>
            <option value="python">python</option>
            <option value="sql">sql</option>
          </select>
          <select
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 flex-1"
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </div>

        <textarea
          value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          placeholder="Prompt (question text)"
          className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2"
          rows={2}
          required
        />

        <textarea
          value={form.snippet}
          onChange={(e) => setForm({ ...form, snippet: e.target.value })}
          placeholder="Code snippet (optional for some types)"
          className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 font-mono text-sm"
          rows={4}
        />

        <input
          value={form.correctAnswer}
          onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
          placeholder="Correct answer"
          className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2"
          required
        />

        <input
          type="number"
          value={form.timeLimitSec}
          onChange={(e) => setForm({ ...form, timeLimitSec: Number(e.target.value) })}
          placeholder="Time limit (seconds)"
          className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2"
        />

        <button
          type="submit"
          disabled={submitting}
          className="bg-white text-black px-4 py-2 rounded-md font-medium disabled:opacity-50"
        >
          {submitting ? "Verifying & saving…" : "Submit puzzle"}
        </button>
      </form>

      {lastResult && (
        <div className="border border-gray-800 rounded-lg p-4 mb-12 text-sm">
          {lastResult.error ? (
            <p className="text-red-400">{lastResult.error}</p>
          ) : (
            <>
              <p className={lastResult.puzzle.verified ? "text-green-400" : "text-yellow-400"}>
                {lastResult.puzzle.verified
                  ? "✓ Auto-verified — sandbox output matched"
                  : "⚠ Saved as unverified — needs manual review"}
              </p>
              {lastResult.verificationDetails?.reason && (
                <p className="text-gray-400 mt-1">{lastResult.verificationDetails.reason}</p>
              )}
            </>
          )}
        </div>
      )}

    <h2 className="text-xl font-semibold mb-4">Recent puzzles ({puzzles.length})</h2>
      <div className="flex flex-col gap-2">
        {puzzles.map((p) =>
          editingId === p._id ? (
            <div key={p._id} className="border border-gray-700 rounded-lg p-4 flex flex-col gap-2">
              <textarea
                value={editForm.prompt}
                onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm"
                rows={2}
              />
              <textarea
                value={editForm.snippet}
                onChange={(e) => setEditForm({ ...editForm, snippet: e.target.value })}
                className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 font-mono text-sm"
                rows={3}
              />
              <input
                value={editForm.correctAnswer}
                onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
                className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(p._id)}
                  className="text-xs bg-white text-black px-3 py-1.5 rounded font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingId(null); setEditForm(null); }}
                  className="text-xs text-gray-400 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={p._id}
              className="flex justify-between items-center border border-gray-800 rounded-lg px-4 py-3 text-sm gap-4"
            >
              <div className="flex-1 min-w-0">
                <span className="text-gray-500 uppercase text-xs mr-2">{p.type}</span>
                <span className="truncate">{p.prompt}</span>
                {p.snippet && (
                  <div className="text-gray-600 text-xs font-mono mt-1 truncate">{p.snippet}</div>
                )}
                <div className="text-gray-600 text-xs mt-1">Answer: {p.correctAnswer}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={p.verified ? "text-green-400" : "text-gray-500"}>
                  {p.verified ? "✓ verified" : "unverified"}
                </span>
                <button
                  onClick={() => startEdit(p)}
                  className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded"
                >
                  Edit
                </button>
                {!p.verified && (
                  <button
                    onClick={() => handleApprove(p._id)}
                    className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded"
                  >
                    Approve
                  </button>
                )}
                {p.verified && (
                  <button
                    onClick={() => handleUnapprove(p._id)}
                    className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded"
                  >
                    Unverify
                  </button>
                )}
                <button
                  onClick={() => handleDelete(p._id)}
                  className="text-xs bg-red-950 text-red-400 px-2 py-1 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </main>
  );
}
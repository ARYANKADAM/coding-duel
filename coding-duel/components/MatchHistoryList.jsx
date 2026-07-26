"use client";

import { useEffect, useState } from "react";

export default function MatchHistoryList() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/user/matches?page=${page}`)
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading && !data) {
    return <p className="text-gray-400 text-sm">Loading match history…</p>;
  }

  if (!data || data.matches.length === 0) {
    return <p className="text-gray-400 text-sm">No matches played yet.</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        {data.matches.map((match) => {
          const opponent = match.players.find((p) => p._id !== data.userId);
          const won = match.winner?._id === data.userId;
          const isDraw = !match.winner;
          const isForfeit = match.status === "aborted";
          const eloDelta = match.eloChange?.[data.userId];

          return (
            <div
              key={match._id}
              className="flex justify-between items-center border border-gray-800 rounded-lg px-4 py-3 text-sm"
            >
              <div>
                <span className={won ? "text-green-400" : isDraw ? "text-gray-400" : "text-red-400"}>
                  {isDraw ? "Draw" : won ? "Won" : "Lost"}
                </span>
                <span className="text-gray-400"> vs {opponent?.username ?? "Unknown"}</span>
                {isForfeit && <span className="text-gray-500 text-xs ml-2">(forfeit)</span>}
                <div className="text-gray-600 text-xs mt-0.5">
                  {new Date(match.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{match.scores?.[data.userId] ?? 0} pts</span>
                {eloDelta !== undefined && (
                  <span className={eloDelta >= 0 ? "text-green-400" : "text-red-400"}>
                    {eloDelta >= 0 ? "+" : ""}
                    {eloDelta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data.totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
          >
            ← Previous
          </button>
          <span className="text-gray-500">
            Page {data.page} of {data.totalPages} ({data.total} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages || loading}
            className="text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
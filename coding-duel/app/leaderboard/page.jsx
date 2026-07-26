"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function LeaderboardPage() {
  const { userId } = useAuth();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [myClerkId, setMyClerkId] = useState(null);

  useEffect(() => {
    setMyClerkId(userId);
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/leaderboard?search=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setUsers(data.leaderboard || []))
        .catch(() => {});
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search]);

  return (
    <main className="max-w-2xl mx-auto py-16 px-6">
      <h1 className="text-3xl font-bold mb-6">Leaderboard</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by username…"
        className="bg-gray-900 border border-gray-800 rounded-md px-3 py-2 mb-6 w-full text-sm"
      />

      <table className="w-full text-left text-sm">
        <thead className="text-gray-400 border-b border-gray-800">
          <tr>
            <th className="py-2">#</th>
            <th className="py-2">Player</th>
            <th className="py-2">ELO</th>
            <th className="py-2">Wins</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr
              key={u._id}
              className={`border-b border-gray-900 ${u.clerkId === myClerkId ? "bg-gray-900" : ""}`}
            >
              <td className="py-2">{i + 1}</td>
              <td className="py-2">{u.username}</td>
              <td className="py-2">{u.elo}</td>
              <td className="py-2">{u.wins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
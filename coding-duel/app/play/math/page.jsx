"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import client from "@/lib/colyseus";

export default function MathSprintPage() {
  const { isLoaded, userId } = useAuth();

  const [queueStatus, setQueueStatus] = useState("connecting");
  const [waitingCount, setWaitingCount] = useState(0);
  const [status, setStatus] = useState("waiting");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [flash, setFlash] = useState(null); // "correct" | "incorrect" | null
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentUsername, setOpponentUsername] = useState("Opponent");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [finalResult, setFinalResult] = useState(null);

  const roomRef = useRef(null);
  const lobbyRoomRef = useRef(null);
  const mySessionIdRef = useRef(null);
  const matchEndsAtRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    if (hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    let lobbyRoom;
    let sprintRoom;

    function attachHandlers(room) {
      room.onMessage("time-sync-response", (data) => {
        clockOffsetRef.current = data.serverTime - Date.now();
      });

      room.onMessage("match-start", () => {
        setStatus("in-progress");
      });

      room.onMessage("question", (data) => {
        setPrompt(data.prompt);
        setAnswer("");
        setFlash(null);
        inputRef.current?.focus();
      });

      room.onMessage("answer-result", (data) => {
        setFlash(data.correct ? "correct" : data.skipped ? null : "incorrect");
      });

      room.onMessage("match-end", (data) => {
        setStatus("completed");
        setFinalResult(data);
      });

      room.onStateChange((state) => {
        setStatus(state.status);
        matchEndsAtRef.current = state.matchEndsAt;

        state.players.forEach((player, sessionId) => {
          if (sessionId === room.sessionId) {
            setMyScore(player.score);
          } else {
            setOpponentScore(player.score);
            setOpponentUsername(player.username || "Opponent");
          }
        });
      });
    }

    async function connect() {
      try {
        lobbyRoom = await client.joinOrCreate("sprintLobby", { clerkId: userId });
        lobbyRoomRef.current = lobbyRoom;
        setQueueStatus("queueing");

        lobbyRoom.onStateChange((state) => setWaitingCount(state.waitingCount));

        lobbyRoom.onMessage("match-found", async (data) => {
          setQueueStatus("matched");
          sprintRoom = await client.consumeSeatReservation(data.reservation);
          roomRef.current = sprintRoom;
          mySessionIdRef.current = sprintRoom.sessionId;

          attachHandlers(sprintRoom);
          sprintRoom.send("time-sync");
          sprintRoom.send("ready");
        });
      } catch (err) {
        console.error("Sprint matchmaking failed:", err);
        setQueueStatus("error");
      }
    }

    connect();

    return () => {
      lobbyRoom?.leave();
      sprintRoom?.leave();
    };
  }, [isLoaded, userId]);

  useEffect(() => {
    if (status !== "in-progress") return;

    const interval = setInterval(() => {
      const estimatedServerNow = Date.now() + clockOffsetRef.current;
      const remaining = Math.max(0, matchEndsAtRef.current - estimatedServerNow);
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [status]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!answer.trim()) return;
    roomRef.current?.send("sprint-answer", { answer: answer.trim() });
  }

  function handleCancelSearch() {
    lobbyRoomRef.current?.send("cancel-search");
  }

  return (
    <main className="max-w-xl mx-auto py-12 px-6">
      <h1 className="text-2xl font-bold mb-2">Math Sprint</h1>
      <p className="text-gray-500 text-sm mb-8">60 seconds. Unlimited questions. Fastest and most accurate wins.</p>

      {!isLoaded && <p className="text-gray-400">Loading…</p>}

      {isLoaded && !userId && (
        <p className="text-gray-400">You need to sign in to play.</p>
      )}

      {isLoaded && userId && queueStatus === "connecting" && <p className="text-gray-400">Connecting…</p>}

{queueStatus === "matched" && status === "waiting" && (
  <p className="text-gray-400 text-center py-12">Match found — starting…</p>
)}

      {isLoaded && userId && queueStatus === "queueing" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-gray-400">Searching for an opponent…</p>
          <p className="text-gray-600 text-sm">{waitingCount} player(s) in queue</p>
          <button onClick={handleCancelSearch} className="text-xs text-gray-500 hover:text-red-400 underline mt-2">
            Cancel search
          </button>
        </div>
      )}

      {queueStatus === "error" && <p className="text-red-400">Matchmaking failed. Refresh to retry.</p>}

      {status === "in-progress" && (
        <div className="flex flex-col gap-8 items-center">
          <div className="w-full flex justify-between text-sm text-gray-400">
            <span>You: <span className="font-semibold text-white">{myScore}</span></span>
            <span className="font-mono text-2xl text-white">{secondsLeft}s</span>
            <span>{opponentUsername}: <span className="font-semibold text-white">{opponentScore}</span></span>
          </div>

          <div
            className={`text-6xl font-bold transition-colors ${
              flash === "correct" ? "text-green-400" : flash === "incorrect" ? "text-red-400" : "text-white"
            }`}
          >
            {prompt}
          </div>

          <form onSubmit={handleSubmit} className="w-full flex gap-2">
  <input
    ref={inputRef}
    type="number"
    value={answer}
    onChange={(e) => setAnswer(e.target.value)}
    placeholder="Answer"
    autoFocus
    className="flex-1 bg-gray-900 border border-gray-800 rounded-md px-4 py-3 text-2xl text-center text-white"
  />
  <button
    type="submit"
    className="bg-white text-black px-6 rounded-md font-medium text-xl"
  >
    Go
  </button>
</form>
        </div>
      )}

      {status === "completed" && finalResult && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="text-2xl font-bold">
            {finalResult.winnerSessionId === mySessionIdRef.current ? "You won!" : finalResult.winnerSessionId ? "You lost." : "Draw."}
          </h2>
          <div className="flex gap-8">
            <div>
              <p className="text-3xl font-bold">{finalResult.scores?.[mySessionIdRef.current]}</p>
              <p className="text-gray-400 text-sm">You</p>
              <p className={(finalResult.eloChange?.[mySessionIdRef.current] ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>
                {(finalResult.eloChange?.[mySessionIdRef.current] ?? 0) >= 0 ? "+" : ""}
                {finalResult.eloChange?.[mySessionIdRef.current] ?? 0} Math ELO
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold">{opponentScore}</p>
              <p className="text-gray-400 text-sm">{opponentUsername}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
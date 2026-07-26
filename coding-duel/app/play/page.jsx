"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import client from "@/lib/colyseus";

const RECONNECT_KEY = "codeduel_reconnect_token";

export default function PlayPage() {
  const { isLoaded, userId } = useAuth();

  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [roomId, setRoomId] = useState(null);
  const [mySessionId, setMySessionId] = useState(null);
  const [amReady, setAmReady] = useState(false);
  const [queueStatus, setQueueStatus] = useState("connecting");
  const [waitingCount, setWaitingCount] = useState(0);

  const [gameState, setGameState] = useState({
    status: "waiting",
    currentRound: 0,
    totalRounds: 0,
    roundType: "",
    roundPrompt: "",
    roundSnippet: "",
    roundTimeLimitSec: 0,
    roundEndsAt: 0,
    players: {},
  });

  const [answer, setAnswer] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const roomRef = useRef(null);
  const lobbyRoomRef = useRef(null);
  const currentRoundRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const clockOffsetRef = useRef(0);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    if (hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    let lobbyRoom;
    let duelRoom;

    function attachDuelRoomHandlers(room) {
      room.onMessage("time-sync-response", (data) => {
        clockOffsetRef.current = data.serverTime - Date.now();
      });
      room.send("time-sync");

      room.onMessage("match-start", () => {
        setConnectionStatus("in-progress");
      });

      room.onMessage("round-end", (roundData) => {
        const myResult = roundData.results?.[room.sessionId];
        setRoundResult({
          correctAnswer: roundData.correctAnswer,
          wasCorrect: myResult?.correct ?? false,
          answered: !!myResult,
        });
      });

      room.onMessage("match-end", (endData) => {
        setFinalResult(endData);
        sessionStorage.removeItem(RECONNECT_KEY);
      });

      room.onStateChange((state) => {
        const playersObj = {};
        state.players.forEach((player, sessionId) => {
          playersObj[sessionId] = {
            score: player.score,
            ready: player.ready,
            hasAnsweredThisRound: player.hasAnsweredThisRound,
            lastAnswerCorrect: player.lastAnswerCorrect,
            username: player.username,
          };
        });

        if (state.currentRound !== currentRoundRef.current) {
          currentRoundRef.current = state.currentRound;
          setAnswer("");
          setHasSubmitted(false);
          setRoundResult(null);
        }

        setGameState({
          status: state.status,
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          roundType: state.roundType,
          roundPrompt: state.roundPrompt,
          roundSnippet: state.roundSnippet,
          roundTimeLimitSec: state.roundTimeLimitSec,
          roundEndsAt: state.roundEndsAt,
          players: playersObj,
        });
      });
    }

    async function tryReconnect() {
      const savedToken = sessionStorage.getItem(RECONNECT_KEY);
      if (!savedToken) return false;

      try {
        duelRoom = await client.reconnect(savedToken);

        // Reconnection tokens are single-use — get a fresh one now so a
        // *second* disconnect later in the same match can also reconnect,
        // instead of trying to reuse the now-invalidated original token.
        if (duelRoom.reconnectionToken) {
          sessionStorage.setItem(RECONNECT_KEY, duelRoom.reconnectionToken);
        }

        attachDuelRoomHandlers(duelRoom);
        roomRef.current = duelRoom;
        setRoomId(duelRoom.roomId);
        setMySessionId(duelRoom.sessionId);
        setConnectionStatus("connected");
        setQueueStatus("matched");
        console.log("Reconnected to existing match");
        return true;
      } catch (err) {
        console.log("Reconnect failed or token expired, clearing:", err.message);
        sessionStorage.removeItem(RECONNECT_KEY);
        return false;
      }
    }

    async function connect() {
      const reconnected = await tryReconnect();
      if (reconnected) return;

      try {
        lobbyRoom = await client.joinOrCreate("lobby", { clerkId: userId });
        lobbyRoomRef.current = lobbyRoom;
        setQueueStatus("queueing");

        lobbyRoom.onStateChange((state) => {
          setWaitingCount(state.waitingCount);
        });

        lobbyRoom.onMessage("match-found", async (data) => {
          setQueueStatus("matched");
          duelRoom = await client.consumeSeatReservation(data.reservation);

          if (duelRoom.reconnectionToken) {
            sessionStorage.setItem(RECONNECT_KEY, duelRoom.reconnectionToken);
          }

          roomRef.current = duelRoom;
          setRoomId(duelRoom.roomId);
          setMySessionId(duelRoom.sessionId);
          setConnectionStatus("connected");

          duelRoom.send("ready");
          setAmReady(true);

          attachDuelRoomHandlers(duelRoom);
        });
      } catch (err) {
        console.error("Matchmaking connection failed:", err);
        setQueueStatus("error");
        setConnectionStatus("failed");
      }
    }

    connect();

    return () => {
      lobbyRoom?.leave();
      duelRoom?.leave();
    };
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!gameState.roundEndsAt) return;

    const interval = setInterval(() => {
      const estimatedServerNow = Date.now() + clockOffsetRef.current;
      const remaining = Math.max(0, gameState.roundEndsAt - estimatedServerNow);
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [gameState.roundEndsAt]);

  function handleSubmit(e) {
    e.preventDefault();
    if (hasSubmitted || !answer.trim()) return;
    roomRef.current?.send("submit-answer", { answer: answer.trim() });
    setHasSubmitted(true);
  }

  function handleForfeit() {
    if (confirm("Forfeit this match? Your opponent will win and your ELO will be affected.")) {
      roomRef.current?.send("forfeit");
      sessionStorage.removeItem(RECONNECT_KEY);
    }
  }

  function handleCancelSearch() {
    lobbyRoomRef.current?.send("cancel-search");
    lobbyRoomRef.current = null;
  }

  const opponentEntry = Object.entries(gameState.players).find(
    ([sessionId]) => sessionId !== mySessionId
  );
  const myEntry = gameState.players[mySessionId];
  const opponent = opponentEntry?.[1];

  return (
    <main className="max-w-2xl mx-auto py-12 px-6">
      <h1 className="text-2xl font-bold mb-2">Duel</h1>
      <p className="text-gray-500 text-sm mb-8">Room: {roomId || "—"}</p>

      {!isLoaded && <p className="text-gray-400">Loading…</p>}

      {isLoaded && !userId && (
        <p className="text-gray-400">
          You need to sign in to play. Use the Sign In button in the navbar.
        </p>
      )}

      {isLoaded && userId && queueStatus === "connecting" && <p>Connecting…</p>}

      {isLoaded && userId && queueStatus === "queueing" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-gray-400">Searching for an opponent…</p>
          <p className="text-gray-600 text-sm">{waitingCount} player(s) in queue</p>
          <button
            onClick={handleCancelSearch}
            className="text-xs text-gray-500 hover:text-red-400 underline mt-2"
          >
            Cancel search
          </button>
        </div>
      )}

      {queueStatus === "error" && (
        <p className="text-red-400">Matchmaking failed. Refresh to retry.</p>
      )}

      {connectionStatus === "connected" && gameState.status === "waiting" && (
        <p className="text-gray-400 text-center py-12">Match found — waiting for opponent to connect…</p>
      )}

      {gameState.status === "in-progress" && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center text-sm text-gray-400">
            <button
              onClick={handleForfeit}
              className="text-xs text-gray-500 hover:text-red-400 underline"
            >
              Forfeit match
            </button>
            <span>
              Round {gameState.currentRound} / {gameState.totalRounds}
            </span>
            <span className="uppercase tracking-wide">{gameState.roundType}</span>
            <span className="font-mono text-lg text-white">{secondsLeft}s</span>
          </div>

          <div className="flex justify-between border border-gray-800 rounded-lg p-3 text-sm">
            <div>
              You: <span className="font-semibold">{myEntry?.score ?? 0}</span>
              {myEntry?.hasAnsweredThisRound && (
                <span className="ml-2 text-green-400">✓ answered</span>
              )}
            </div>
            <div>
              {opponent?.username || "Opponent"}:{" "}
              <span className="font-semibold">{opponent?.score ?? 0}</span>
              {opponent?.hasAnsweredThisRound && (
                <span className="ml-2 text-gray-400">✓ answered</span>
              )}
            </div>
          </div>

          <p className="text-xl font-medium text-gray-100 leading-relaxed">
            {gameState.roundPrompt}
          </p>

          {gameState.roundSnippet && (
            <pre className="bg-black border-2 border-gray-700 rounded-lg p-4 overflow-x-auto">
              <code className="text-base text-green-300 font-mono leading-relaxed">
                {gameState.roundSnippet}
              </code>
            </pre>
          )}

          {!roundResult ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={hasSubmitted}
                placeholder="Your answer"
                className="flex-1 bg-gray-900 border border-gray-800 rounded-md px-3 py-2 text-white disabled:opacity-50"
                autoFocus
              />
              <button
                type="submit"
                disabled={hasSubmitted || !answer.trim()}
                className="bg-white text-black px-4 py-2 rounded-md font-medium disabled:opacity-50"
              >
                {hasSubmitted ? "Submitted" : "Submit"}
              </button>
            </form>
          ) : (
            <div className="border border-gray-800 rounded-lg p-4 text-sm">
              <p className={roundResult.wasCorrect ? "text-green-400" : "text-red-400"}>
                {roundResult.answered
                  ? roundResult.wasCorrect
                    ? "Correct!"
                    : "Incorrect."
                  : "No answer submitted."}
              </p>
              <p className="text-gray-300 mt-1 text-base">
                Correct answer:{" "}
                <span className="text-white font-semibold">{roundResult.correctAnswer}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {gameState.status === "completed" && finalResult && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="text-2xl font-bold">
            {finalResult.winnerSessionId === mySessionId
              ? "You won!"
              : finalResult.winnerSessionId
              ? "You lost."
              : "Draw."}
          </h2>
          {finalResult.forfeited && (
            <p className="text-gray-400 text-sm">Your opponent disconnected and didn't return.</p>
          )}
          <div className="flex gap-8">
            <div>
              <p className="text-3xl font-bold">{finalResult.scores?.[mySessionId]}</p>
              <p className="text-gray-400 text-sm">You</p>
              <p
                className={
                  (finalResult.eloChange?.[mySessionId] ?? 0) >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }
              >
                {(finalResult.eloChange?.[mySessionId] ?? 0) >= 0 ? "+" : ""}
                {finalResult.eloChange?.[mySessionId] ?? 0} ELO
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold">
                {opponentEntry ? finalResult.scores?.[opponentEntry[0]] : "—"}
              </p>
              <p className="text-gray-400 text-sm">Opponent</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
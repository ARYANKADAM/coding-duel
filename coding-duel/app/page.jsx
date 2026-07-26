import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center py-24 text-center gap-6 px-6">
      <h1 className="text-4xl font-bold max-w-2xl">Chess.com, but for programmers.</h1>
      <p className="text-gray-400 max-w-md">
        Live 1v1 duels: predict output, spot the bug, crack the regex — against real opponents,
        matched and ranked by ELO.
      </p>
      <Link
        href="/play"
        className="bg-white text-black px-6 py-3 rounded-md font-medium hover:bg-gray-200 transition"
      >
        Find a match
      </Link>
      <div className="flex gap-6 text-sm text-gray-500 mt-4">
        <span>⚡ Predict Output</span>
        <span>🐛 Spot the Bug</span>
        <span>🔤 Regex Match</span>
        <span>🗄️ SQL Output</span>
        <span>📈 Time Complexity</span>
      </div>
    </main>
  );
}
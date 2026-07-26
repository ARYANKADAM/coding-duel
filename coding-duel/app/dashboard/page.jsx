import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import MatchHistoryList from "@/components/MatchHistoryList";

export default async function DashboardPage() {
  const { userId } = await auth();
  await connectDB();
  const user = await User.findOne({ clerkId: userId }).lean();

  if (!user) {
    return <div className="p-8">Setting up your profile — refresh in a moment.</div>;
  }

  return (
    <main className="max-w-2xl mx-auto py-16 px-6">
      <h1 className="text-3xl font-bold mb-8">Welcome, {user.username}</h1>
      <div className="grid grid-cols-3 gap-4 mb-12">
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold">{user.elo}</p>
          <p className="text-gray-400 text-sm">ELO</p>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold">{user.matchesPlayed}</p>
          <p className="text-gray-400 text-sm">Matches</p>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <p className="text-2xl font-semibold">{user.wins}</p>
          <p className="text-gray-400 text-sm">Wins</p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">Match history</h2>
      <MatchHistoryList />
    </main>
  );
}
"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";


export default function Navbar() {
  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <span className="font-semibold text-lg">CodeDuel</span>

      <div className="flex items-center gap-4 text-sm text-gray-400">
        <a href="/">Home</a>
       <a href="/play">Coding Duel</a>
        <a href="/play/math">Math Sprint</a>
        <a href="/leaderboard">Leaderboard</a>

        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="bg-white text-black px-3 py-1.5 rounded-md text-sm font-medium">
              Sign In
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </nav>
  );
}
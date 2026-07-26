import mongoose from "mongoose";
import { config } from "dotenv";
import { createClerkClient } from "@clerk/backend";
import User from "../models/User.js";

config({ path: ".env.local" });

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);

  const { data: clerkUsers } = await clerkClient.users.getUserList({ limit: 100 });

  for (const cu of clerkUsers) {
    const existing = await User.findOne({ clerkId: cu.id });
    if (existing) {
      console.log(`Skipping ${cu.id} — already exists`);
      continue;
    }

    const email = cu.emailAddresses?.[0]?.emailAddress || `${cu.id}@placeholder.com`;
    const username = cu.username || email.split("@")[0];

    await User.create({
      clerkId: cu.id,
      username,
      email,
    });
    console.log(`Created User for ${username} (${cu.id})`);
  }

  console.log("Backfill complete");
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
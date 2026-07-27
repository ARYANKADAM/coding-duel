import * as Sentry from "@sentry/node";
import dotenv from "dotenv";

dotenv.config();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
  console.log("Sentry initialized");
}
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { ensureSchema } from "./db/schema.js";
import {
  startReminderScheduler,
  stopReminderScheduler,
} from "./jobs/reminderScheduler.js";

async function main(): Promise<void> {
  await ensureSchema();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[app] Listening on :${env.port}`);
  });

  startReminderScheduler();

  const shutdown = async (signal: string) => {
    console.log(`[app] Received ${signal}, shutting down...`);
    stopReminderScheduler();
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[app] Failed to start:", error);
  process.exit(1);
});

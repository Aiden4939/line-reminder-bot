import cron from "node-cron";
import { env } from "../config/env.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import * as lineService from "../services/lineService.js";
import { formatDateTime } from "../utils/dateParser.js";

let task: cron.ScheduledTask | null = null;

async function processDueReminders(): Promise<void> {
  const now = new Date();
  const dueReminders = await reminderRepository.findDueReminders(now);

  for (const reminder of dueReminders) {
    const claimed = await reminderRepository.claimReminder(reminder.id);
    if (!claimed) {
      continue;
    }

    const pushText = `提醒時間到！\n#${claimed.id} | ${formatDateTime(claimed.remindAt)}\n${claimed.message}`;

    try {
      await lineService.pushReminder(
        claimed.sourceType,
        claimed.sourceId,
        pushText
      );
      await reminderRepository.markSent(claimed.id);
      console.log(`[scheduler] Sent reminder #${claimed.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await reminderRepository.markFailed(claimed.id, errorMessage);
      console.error(`[scheduler] Failed to send reminder #${claimed.id}:`, error);
    }
  }
}

export function startReminderScheduler(): cron.ScheduledTask {
  if (task) {
    return task;
  }

  task = cron.schedule(env.reminderCron, () => {
    processDueReminders().catch((error) => {
      console.error("[scheduler] Unexpected error:", error);
    });
  });

  console.log(`[scheduler] Started with cron: ${env.reminderCron}`);
  return task;
}

export function stopReminderScheduler(): void {
  if (task) {
    task.stop();
    task = null;
    console.log("[scheduler] Stopped");
  }
}

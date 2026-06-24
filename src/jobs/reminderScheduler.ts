import cron from "node-cron";
import { env } from "../config/env.js";
import * as notificationSettingsRepository from "../repositories/notificationSettingsRepository.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import * as lineService from "../services/lineService.js";
import { formatDateTime } from "../utils/dateParser.js";
import {
  computeNextRemindAt,
  formatRecurrenceTypeLabel,
  toRecurrenceRule,
} from "../utils/recurrence.js";

let task: cron.ScheduledTask | null = null;

export async function processDueReminders(): Promise<void> {
  const now = new Date();
  const dueReminders = await reminderRepository.findDueReminders(now);

  for (const reminder of dueReminders) {
    const rule = toRecurrenceRule(reminder);
    const notificationsEnabled =
      await notificationSettingsRepository.getNotificationsEnabled(
        reminder.sourceType,
        reminder.sourceId,
        reminder.userId
      );

    if (!notificationsEnabled && !rule) {
      // One-shot: keep pending so overdue reminders can fire after re-enable.
      continue;
    }

    // Recurring with notifications off: still advance schedule without push
    // so the series does not block the due queue (per product spec).

    const claimed = await reminderRepository.claimReminder(reminder.id);
    if (!claimed) {
      continue;
    }

    const shouldPush =
      notificationsEnabled && !claimed.skipNextOnce;
    const clearSkipNextOnce = claimed.skipNextOnce;

    if (shouldPush) {
      const recurrenceLabel = formatRecurrenceTypeLabel(claimed.recurrenceType);
      const recurrenceSuffix = recurrenceLabel
        ? `（${recurrenceLabel}重複）`
        : "";
      const pushText = `提醒時間到！${recurrenceSuffix}\n#${claimed.id} | ${formatDateTime(claimed.remindAt)}\n${claimed.message}`;

      try {
        await lineService.pushReminder(
          claimed.sourceType,
          claimed.sourceId,
          pushText
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await reminderRepository.markFailed(claimed.id, errorMessage);
        console.error(
          `[scheduler] Failed to send reminder #${claimed.id}:`,
          error
        );
        continue;
      }
    }

    if (rule) {
      const nextRemindAt = computeNextRemindAt(claimed.remindAt, rule);
      await reminderRepository.markRecurringNext(
        claimed.id,
        nextRemindAt,
        clearSkipNextOnce
      );
      if (shouldPush) {
        console.log(
          `[scheduler] Sent recurring reminder #${claimed.id}, next at ${formatDateTime(nextRemindAt)}`
        );
      } else if (clearSkipNextOnce) {
        console.log(
          `[scheduler] Skipped recurring reminder #${claimed.id}, next at ${formatDateTime(nextRemindAt)}`
        );
      } else {
        console.log(
          `[scheduler] Advanced recurring reminder #${claimed.id} without push, next at ${formatDateTime(nextRemindAt)}`
        );
      }
      continue;
    }

    if (shouldPush) {
      await reminderRepository.markSent(claimed.id);
      console.log(`[scheduler] Sent reminder #${claimed.id}`);
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

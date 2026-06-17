import { pool } from "../db/pool.js";
import type {
  CreateReminderInput,
  Reminder,
  SourceType,
} from "../types/reminder.js";

interface ReminderRow {
  id: number;
  source_type: SourceType;
  source_id: string;
  user_id: string;
  message: string;
  remind_at: Date;
  recurrence_type: Reminder["recurrenceType"];
  recurrence_time: string | null;
  recurrence_weekday: number | null;
  recurrence_day_of_month: number | null;
  status: Reminder["status"];
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    userId: row.user_id,
    message: row.message,
    remindAt: row.remind_at,
    recurrenceType: row.recurrence_type ?? "none",
    recurrenceTime: row.recurrence_time,
    recurrenceWeekday: row.recurrence_weekday,
    recurrenceDayOfMonth: row.recurrence_day_of_month,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createReminder(
  input: CreateReminderInput
): Promise<Reminder> {
  const result = await pool.query<ReminderRow>(
    `INSERT INTO reminders (
       source_type, source_id, user_id, message, remind_at,
       recurrence_type, recurrence_time, recurrence_weekday, recurrence_day_of_month
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.sourceType,
      input.sourceId,
      input.userId,
      input.message,
      input.remindAt,
      input.recurrenceType ?? "none",
      input.recurrenceTime ?? null,
      input.recurrenceWeekday ?? null,
      input.recurrenceDayOfMonth ?? null,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function findPendingBySourceAndUser(
  sourceType: SourceType,
  sourceId: string,
  userId: string
): Promise<Reminder[]> {
  const result = await pool.query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE source_type = $1 AND source_id = $2 AND user_id = $3 AND status = 'pending'
     ORDER BY remind_at ASC`,
    [sourceType, sourceId, userId]
  );
  return result.rows.map(mapRow);
}

export async function cancelReminder(
  id: number,
  sourceType: SourceType,
  sourceId: string,
  userId: string
): Promise<Reminder | null> {
  const result = await pool.query<ReminderRow>(
    `UPDATE reminders
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND source_type = $2 AND source_id = $3 AND user_id = $4 AND status = 'pending'
     RETURNING *`,
    [id, sourceType, sourceId, userId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function findDueReminders(now: Date): Promise<Reminder[]> {
  const result = await pool.query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE status = 'pending' AND remind_at <= $1
     ORDER BY remind_at ASC`,
    [now]
  );
  return result.rows.map(mapRow);
}

export async function claimReminder(id: number): Promise<Reminder | null> {
  const result = await pool.query<ReminderRow>(
    `UPDATE reminders
     SET status = 'processing', updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function markSent(id: number): Promise<void> {
  await pool.query(
    `UPDATE reminders
     SET status = 'sent', updated_at = now(), error_message = NULL
     WHERE id = $1 AND status = 'processing'`,
    [id]
  );
}

export async function markRecurringNext(
  id: number,
  nextRemindAt: Date
): Promise<void> {
  await pool.query(
    `UPDATE reminders
     SET status = 'pending', remind_at = $2, updated_at = now(), error_message = NULL
     WHERE id = $1 AND status = 'processing'`,
    [id, nextRemindAt]
  );
}

export async function markFailed(
  id: number,
  errorMessage: string
): Promise<void> {
  await pool.query(
    `UPDATE reminders
     SET status = 'failed', updated_at = now(), error_message = $2
     WHERE id = $1 AND status = 'processing'`,
    [id, errorMessage]
  );
}

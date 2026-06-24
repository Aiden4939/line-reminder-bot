import { pool } from "../db/pool.js";
import type { SourceType } from "../types/reminder.js";

export async function getNotificationsEnabled(
  sourceType: SourceType,
  sourceId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM user_notification_settings
     WHERE source_type = $1 AND source_id = $2 AND user_id = $3`,
    [sourceType, sourceId, userId]
  );
  if (result.rows.length === 0) {
    return true;
  }
  return result.rows[0].enabled;
}

export async function setNotificationsEnabled(
  sourceType: SourceType,
  sourceId: string,
  userId: string,
  enabled: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO user_notification_settings (source_type, source_id, user_id, enabled, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (source_type, source_id, user_id)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [sourceType, sourceId, userId, enabled]
  );
}

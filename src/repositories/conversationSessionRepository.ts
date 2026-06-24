import { pool } from "../db/pool.js";
import type {
  ConversationSession,
  CreateReminderDraft,
  CreateReminderWizardStep,
  SourceType,
} from "../types/reminder.js";

const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionRow {
  source_type: SourceType;
  source_id: string;
  user_id: string;
  flow: "create_reminder";
  step: CreateReminderWizardStep;
  draft: CreateReminderDraft;
  expires_at: Date;
  updated_at: Date;
}

function mapRow(row: SessionRow): ConversationSession {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    userId: row.user_id,
    flow: row.flow,
    step: row.step,
    draft: row.draft ?? {},
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

export async function findActiveSession(
  sourceType: SourceType,
  sourceId: string,
  userId: string
): Promise<ConversationSession | null> {
  const result = await pool.query<SessionRow>(
    `SELECT * FROM conversation_sessions
     WHERE source_type = $1 AND source_id = $2 AND user_id = $3
       AND expires_at > now()`,
    [sourceType, sourceId, userId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function upsertSession(
  sourceType: SourceType,
  sourceId: string,
  userId: string,
  step: CreateReminderWizardStep,
  draft: CreateReminderDraft
): Promise<ConversationSession> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const result = await pool.query<SessionRow>(
    `INSERT INTO conversation_sessions (
       source_type, source_id, user_id, flow, step, draft, expires_at, updated_at
     )
     VALUES ($1, $2, $3, 'create_reminder', $4, $5::jsonb, $6, now())
     ON CONFLICT (source_type, source_id, user_id)
     DO UPDATE SET
       flow = 'create_reminder',
       step = EXCLUDED.step,
       draft = EXCLUDED.draft,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING *`,
    [sourceType, sourceId, userId, step, JSON.stringify(draft), expiresAt]
  );
  return mapRow(result.rows[0]);
}

export async function deleteSession(
  sourceType: SourceType,
  sourceId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM conversation_sessions
     WHERE source_type = $1 AND source_id = $2 AND user_id = $3`,
    [sourceType, sourceId, userId]
  );
}

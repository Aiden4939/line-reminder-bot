import { pool } from "./pool.js";

export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id              SERIAL PRIMARY KEY,
      source_type     TEXT NOT NULL CHECK (source_type IN ('user', 'group', 'room')),
      source_id       TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      message         TEXT NOT NULL,
      remind_at       TIMESTAMPTZ NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed')),
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders (status, remind_at)
      WHERE status = 'pending';
  `);

  await pool.query(`
    ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_status_check;
    ALTER TABLE reminders ADD CONSTRAINT reminders_status_check
      CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed'));
  `);

  await pool.query(`
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS recurrence_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS recurrence_time TEXT;
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS recurrence_weekday SMALLINT;
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS recurrence_day_of_month SMALLINT;
  `);

  await pool.query(`
    ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_recurrence_type_check;
    ALTER TABLE reminders ADD CONSTRAINT reminders_recurrence_type_check
      CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly'));
  `);

  await pool.query(`
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS skip_next_once BOOLEAN NOT NULL DEFAULT false;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_settings (
      source_type  TEXT NOT NULL,
      source_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      enabled      BOOLEAN NOT NULL DEFAULT true,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source_type, source_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      source_type  TEXT NOT NULL,
      source_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      flow         TEXT NOT NULL,
      step         TEXT NOT NULL,
      draft        JSONB NOT NULL DEFAULT '{}',
      expires_at   TIMESTAMPTZ NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source_type, source_id, user_id)
    );
  `);
}

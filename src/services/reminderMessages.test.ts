import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "Asia/Taipei";
process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";

const { buildReminderPushMessage } = await import("./reminderMessages.js");
const { parseAbsoluteDateTime } = await import("../utils/dateParser.js");

test("buildReminderPushMessage formats one-shot reminder minimally", () => {
  const remindAt = parseAbsoluteDateTime("2026-06-25 14:30");
  assert.ok(remindAt);
  const now = parseAbsoluteDateTime("2026-06-25 14:30");
  assert.ok(now);

  const message = buildReminderPushMessage(
    {
      id: 1,
      message: "開會",
      remindAt,
      recurrenceType: "none",
      recurrenceTime: null,
      recurrenceWeekday: null,
      recurrenceDayOfMonth: null,
    },
    now
  );

  assert.equal(message, "開會\n今天 14:30");
});

test("buildReminderPushMessage formats daily recurring reminder minimally", () => {
  const remindAt = parseAbsoluteDateTime("2026-06-25 09:00");
  assert.ok(remindAt);

  const message = buildReminderPushMessage({
    id: 2,
    message: "喝水",
    remindAt,
    recurrenceType: "daily",
    recurrenceTime: "09:00",
    recurrenceWeekday: null,
    recurrenceDayOfMonth: null,
  });

  assert.equal(message, "喝水\n每天 09:00");
});

test("buildReminderPushMessage formats weekly recurring reminder minimally", () => {
  const remindAt = parseAbsoluteDateTime("2026-06-23 09:00");
  assert.ok(remindAt);

  const message = buildReminderPushMessage({
    id: 3,
    message: "開會",
    remindAt,
    recurrenceType: "weekly",
    recurrenceTime: "09:00",
    recurrenceWeekday: 1,
    recurrenceDayOfMonth: null,
  });

  assert.equal(message, "開會\n每週一 09:00");
});

test("buildReminderPushMessage formats monthly recurring reminder minimally", () => {
  const remindAt = parseAbsoluteDateTime("2026-06-15 09:00");
  assert.ok(remindAt);

  const message = buildReminderPushMessage({
    id: 4,
    message: "繳費",
    remindAt,
    recurrenceType: "monthly",
    recurrenceTime: "09:00",
    recurrenceWeekday: null,
    recurrenceDayOfMonth: 15,
  });

  assert.equal(message, "繳費\n每月15日 09:00");
});

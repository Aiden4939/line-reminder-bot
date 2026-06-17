import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "Asia/Taipei";
process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";

const {
  computeFirstRemindAt,
  computeNextRemindAt,
  formatRecurrenceSchedule,
} = await import("../utils/recurrence.js");

test("computeFirstRemindAt schedules daily reminder for later today", () => {
  const now = new Date("2026-06-20T00:30:00.000Z"); // 08:30 Taipei
  const remindAt = computeFirstRemindAt(now, {
    recurrenceType: "daily",
    time: "09:00",
  });
  assert.equal(remindAt.toISOString(), "2026-06-20T01:00:00.000Z");
});

test("computeFirstRemindAt schedules daily reminder for tomorrow when time passed", () => {
  const now = new Date("2026-06-20T02:00:00.000Z"); // 10:00 Taipei
  const remindAt = computeFirstRemindAt(now, {
    recurrenceType: "daily",
    time: "09:00",
  });
  assert.equal(remindAt.toISOString(), "2026-06-21T01:00:00.000Z");
});

test("computeNextRemindAt advances weekly reminder by one week", () => {
  const current = new Date("2026-06-16T01:00:00.000Z"); // Monday 09:00 Taipei
  const next = computeNextRemindAt(current, {
    recurrenceType: "weekly",
    time: "09:00",
    weekday: 1,
  });
  assert.equal(next.toISOString(), "2026-06-23T01:00:00.000Z");
});

test("computeFirstRemindAt uses month-end fallback for monthly reminder", () => {
  const now = new Date("2026-01-31T02:00:00.000Z"); // 10:00 Taipei on Jan 31
  const remindAt = computeFirstRemindAt(now, {
    recurrenceType: "monthly",
    time: "09:00",
    dayOfMonth: 31,
  });
  assert.equal(remindAt.toISOString(), "2026-02-28T01:00:00.000Z");
});

test("computeNextRemindAt uses month-end fallback for monthly reminder", () => {
  const current = new Date("2026-01-31T01:00:00.000Z"); // Jan 31 09:00 Taipei
  const next = computeNextRemindAt(current, {
    recurrenceType: "monthly",
    time: "09:00",
    dayOfMonth: 31,
  });
  assert.equal(next.toISOString(), "2026-02-28T01:00:00.000Z");
});

test("formatRecurrenceSchedule renders recurring labels", () => {
  assert.equal(
    formatRecurrenceSchedule({
      recurrenceType: "weekly",
      recurrenceTime: "09:00",
      recurrenceWeekday: 1,
      recurrenceDayOfMonth: null,
    }),
    "每週一 09:00"
  );
});

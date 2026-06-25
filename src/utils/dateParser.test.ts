import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.TZ = "Asia/Taipei";

const { parseAbsoluteDateTime, truncateToMinute, formatReminderPushDateTime } =
  await import("./dateParser.js");

test("parseAbsoluteDateTime rejects hour 24 and 25", () => {
  assert.equal(parseAbsoluteDateTime("2026-06-24 24:30"), null);
  assert.equal(parseAbsoluteDateTime("2026-06-24 25:00"), null);
  assert.equal(parseAbsoluteDateTime("2026-06-24 09:60"), null);
});

test("parseAbsoluteDateTime accepts valid clock with minutes", () => {
  const parsed = parseAbsoluteDateTime("2026-06-24 09:30");
  assert.ok(parsed);
  const truncated = truncateToMinute(parsed!);
  assert.ok(truncated);
  const repr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(truncated!);
  assert.equal(repr, "09:30");
});

test("truncateToMinute does not throw on valid date", () => {
  const parsed = parseAbsoluteDateTime("2026-06-24 09:30");
  assert.ok(parsed);
  const truncated = truncateToMinute(parsed!);
  assert.ok(truncated);
});

test("formatReminderPushDateTime uses relative labels for one-shot reminders", () => {
  const now = parseAbsoluteDateTime("2026-06-25 10:00");
  assert.ok(now);

  const today = parseAbsoluteDateTime("2026-06-25 14:30");
  assert.ok(today);
  assert.equal(formatReminderPushDateTime(today, now), "今天 14:30");

  const tomorrow = parseAbsoluteDateTime("2026-06-26 09:00");
  assert.ok(tomorrow);
  assert.equal(formatReminderPushDateTime(tomorrow, now), "明天 09:00");

  const later = parseAbsoluteDateTime("2026-07-01 09:00");
  assert.ok(later);
  assert.equal(formatReminderPushDateTime(later, now), "7/1 09:00");
});

import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.TZ = "Asia/Taipei";

const { parseAbsoluteDateTime, truncateToMinute } = await import(
  "./dateParser.js"
);

test("parseAbsoluteDateTime rejects hour 24 and 25", () => {
  assert.equal(parseAbsoluteDateTime("2026-06-24 24:30"), null);
  assert.equal(parseAbsoluteDateTime("2026-06-24 25:00"), null);
  assert.equal(parseAbsoluteDateTime("2026-06-24 09:60"), null);
});

test("parseAbsoluteDateTime accepts valid clock", () => {
  const parsed = parseAbsoluteDateTime("2026-06-24 09:30");
  assert.ok(parsed);
  assert.equal(parsed?.getTime(), parsed?.getTime());
});

test("truncateToMinute does not throw on valid date", () => {
  const parsed = parseAbsoluteDateTime("2026-06-24 09:30");
  assert.ok(parsed);
  const truncated = truncateToMinute(parsed!);
  assert.ok(truncated);
});

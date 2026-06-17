import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";

const { parseCommand } = await import("./commandParser.js");

test("supports list aliases", () => {
  assert.deepEqual(parseCommand("查詢"), { type: "list" });
  assert.deepEqual(parseCommand("清單"), { type: "list" });
  assert.deepEqual(parseCommand("查詢提醒"), { type: "list" });
});

test("supports create relative spacing variants", () => {
  const tight = parseCommand("提醒我5分鐘後 喝水");
  const spaced = parseCommand("提醒我 5 分鐘後 喝水");

  assert.equal(tight.type, "create");
  assert.equal(spaced.type, "create");
  if (tight.type === "create") {
    assert.equal(tight.message, "喝水");
  }
  if (spaced.type === "create") {
    assert.equal(spaced.message, "喝水");
  }
});

test("supports cancel aliases", () => {
  assert.deepEqual(parseCommand("取消提醒 12"), { type: "cancel", id: 12 });
  assert.deepEqual(parseCommand("取消 12"), { type: "cancel", id: 12 });
});

test("returns specific help reason for invalid datetime format", () => {
  assert.deepEqual(parseCommand("提醒我 2026-13-99 09:30 開會"), {
    type: "help",
    reason: "invalid_datetime_format",
  });
});

test("returns specific help reason for missing message", () => {
  assert.deepEqual(parseCommand("提醒我 10分鐘後"), {
    type: "help",
    reason: "missing_message",
  });
  assert.deepEqual(parseCommand("提醒我 2026-06-20 09:30"), {
    type: "help",
    reason: "missing_message",
  });
});

test("returns specific help reason for invalid cancel id", () => {
  assert.deepEqual(parseCommand("取消提醒 abc"), {
    type: "help",
    reason: "invalid_cancel_id",
  });
});

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

test("returns explicit_help for help keywords", () => {
  assert.deepEqual(parseCommand("使用說明"), {
    type: "help",
    reason: "explicit_help",
  });
  assert.deepEqual(parseCommand("說明"), {
    type: "help",
    reason: "explicit_help",
  });
  assert.deepEqual(parseCommand("help"), {
    type: "help",
    reason: "explicit_help",
  });
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

test("supports daily recurring command variants", () => {
  const spaced = parseCommand("每天 09:00 喝水");
  const alias = parseCommand("每天提醒我 09:00 喝水");

  assert.equal(spaced.type, "createRecurring");
  assert.equal(alias.type, "createRecurring");
  if (spaced.type === "createRecurring") {
    assert.equal(spaced.recurrenceType, "daily");
    assert.equal(spaced.time, "09:00");
    assert.equal(spaced.message, "喝水");
  }
});

test("supports weekly recurring command variants", () => {
  const command = parseCommand("每週一 09:00 開會");
  assert.equal(command.type, "createRecurring");
  if (command.type === "createRecurring") {
    assert.equal(command.recurrenceType, "weekly");
    assert.equal(command.weekday, 1);
    assert.equal(command.time, "09:00");
  }
});

test("supports monthly recurring command variants", () => {
  const command = parseCommand("每月15日提醒我 09:00 繳費");
  assert.equal(command.type, "createRecurring");
  if (command.type === "createRecurring") {
    assert.equal(command.recurrenceType, "monthly");
    assert.equal(command.dayOfMonth, 15);
    assert.equal(command.time, "09:00");
  }
});

test("returns specific help reason for invalid recurring input", () => {
  assert.deepEqual(parseCommand("每天 25:99 喝水"), {
    type: "help",
    reason: "invalid_recurring_time_format",
  });
  assert.deepEqual(parseCommand("每週一 09:00"), {
    type: "help",
    reason: "missing_recurring_message",
  });
  assert.deepEqual(parseCommand("每月32日 09:00 繳費"), {
    type: "help",
    reason: "invalid_day_of_month",
  });
});

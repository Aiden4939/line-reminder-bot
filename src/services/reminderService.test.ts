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
  buildCreateSuccessMessage,
  buildReminderListMessages,
  buildCancelNotFoundMessage,
  buildCancelSuccessMessage,
  buildHelpMessage,
} = await import("./reminderService.js");

const oneShotReminder = {
  id: 3,
  remindAt: new Date("2026-06-20T01:30:00.000Z"),
  message: "喝水",
  recurrenceType: "none" as const,
  recurrenceTime: null,
  recurrenceWeekday: null,
  recurrenceDayOfMonth: null,
};

test("buildCreateSuccessMessage includes next-step actions", () => {
  const message = buildCreateSuccessMessage(oneShotReminder);

  assert.match(message, /已建立提醒 #3/);
  assert.match(message, /可輸入「查詢提醒」/);
  assert.match(message, /取消提醒 3/);
});

test("buildCreateSuccessMessage includes recurring schedule", () => {
  const message = buildCreateSuccessMessage({
    ...oneShotReminder,
    id: 5,
    recurrenceType: "daily",
    recurrenceTime: "09:00",
    message: "運動",
  });

  assert.match(message, /已建立每日提醒 #5/);
  assert.match(message, /之後每天 09:00 重複/);
});

test("buildReminderListMessages returns single message for small list", () => {
  const messages = buildReminderListMessages([oneShotReminder]);

  assert.equal(messages.length, 1);
  assert.match(messages[0], /待發送提醒（共 1 筆）/);
  assert.match(messages[0], /#3 \|/);
});

test("buildReminderListMessages splits long lists into multiple messages", () => {
  const reminders = Array.from({ length: 11 }, (_, index) => ({
    ...oneShotReminder,
    id: index + 1,
    message: `事項${index + 1}`,
  }));

  const messages = buildReminderListMessages(reminders);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /第 1\/2 段/);
  assert.match(messages[1], /第 2\/2 段/);
});

test("buildCancelNotFoundMessage guides user to list before cancel", () => {
  const message = buildCancelNotFoundMessage(77);
  assert.match(message, /找不到可取消的提醒 #77/);
  assert.match(message, /請先輸入「查詢提醒」/);
});

test("buildCancelSuccessMessage distinguishes recurring reminders", () => {
  assert.match(
    buildCancelSuccessMessage({
      ...oneShotReminder,
      recurrenceType: "weekly",
      recurrenceTime: "09:00",
      recurrenceWeekday: 1,
    }),
    /已取消每週提醒 #3/
  );
});

test("buildHelpMessage returns targeted hints by reason", () => {
  assert.match(buildHelpMessage("invalid_datetime_format"), /時間格式錯誤/);
  assert.match(buildHelpMessage("missing_message"), /請補上提醒內容/);
  assert.match(buildHelpMessage("invalid_cancel_id"), /ID 必須是數字/);
  assert.match(buildHelpMessage("invalid_recurring_time_format"), /HH:mm/);
  assert.match(buildHelpMessage("invalid_weekday"), /星期格式錯誤/);
  assert.match(buildHelpMessage(), /提醒 Bot 使用說明/);
});

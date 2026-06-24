import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.TZ ||= "Asia/Taipei";

const {
  buildEditTimePickerFlex,
  reminderToFlexItem,
  resolveQuickPickDatetime,
} = await import("./editReminderTime.js");

test("buildEditTimePickerFlex uses datetime mode for once reminder", () => {
  const flex = buildEditTimePickerFlex({
    id: 1,
    sourceType: "user",
    sourceId: "u1",
    userId: "u1",
    message: "喝水",
    remindAt: new Date("2026-06-25T10:00:00+08:00"),
    status: "pending",
    recurrenceType: "none",
    recurrenceTime: null,
    recurrenceWeekday: null,
    recurrenceDayOfMonth: null,
    isPaused: false,
    skipNextOnce: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(flex.type, "flex");
  if (flex.contents.type === "bubble") {
    const button = flex.contents.footer?.contents[0];
    assert.ok(button && button.type === "button");
    assert.equal(button.action.type, "datetimepicker");
    if (button.action.type === "datetimepicker") {
      assert.equal(button.action.mode, "datetime");
      assert.match(button.action.data ?? "", /action=edit_time_submit&id=1/);
    }
  }
});

test("buildEditTimePickerFlex uses time mode for recurring reminder", () => {
  const flex = buildEditTimePickerFlex({
    id: 2,
    sourceType: "user",
    sourceId: "u1",
    userId: "u1",
    message: "開會",
    remindAt: new Date("2026-06-25T09:00:00+08:00"),
    status: "pending",
    recurrenceType: "daily",
    recurrenceTime: "09:00",
    recurrenceWeekday: null,
    recurrenceDayOfMonth: null,
    isPaused: false,
    skipNextOnce: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (flex.contents.type === "bubble") {
    const button = flex.contents.footer?.contents[0];
    assert.ok(button && button.type === "button");
    if (button.action.type === "datetimepicker") {
      assert.equal(button.action.mode, "time");
    }
  }
});

test("reminderToFlexItem maps reminder fields", () => {
  const item = reminderToFlexItem({
    id: 5,
    sourceType: "user",
    sourceId: "u1",
    userId: "u1",
    message: "繳費",
    remindAt: new Date("2026-06-25T09:00:00+08:00"),
    status: "pending",
    recurrenceType: "monthly",
    recurrenceTime: "09:00",
    recurrenceWeekday: null,
    recurrenceDayOfMonth: 15,
    isPaused: false,
    skipNextOnce: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(item.id, 5);
  assert.equal(item.recurrenceType, "monthly");
  assert.equal(item.recurrenceDayOfMonth, 15);
});

test("resolveQuickPickDatetime returns ISO-like datetime strings", () => {
  const result30m = resolveQuickPickDatetime("30m");
  assert.ok(result30m);
  assert.match(result30m, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

  const result1h = resolveQuickPickDatetime("1h");
  assert.ok(result1h);

  const resultTomorrow = resolveQuickPickDatetime("tomorrow9");
  assert.ok(resultTomorrow);
  assert.match(resultTomorrow, /T09:00$/);

  assert.equal(resolveQuickPickDatetime("invalid"), null);
});

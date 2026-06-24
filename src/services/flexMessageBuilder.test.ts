import assert from "node:assert/strict";
import test from "node:test";
import type { ReminderFlexItem } from "./flexMessageBuilder.js";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";

const { buildReminderListFlex, buildReminderListOverflowText } = await import(
  "./flexMessageBuilder.js"
);

test("buildReminderListFlex returns carousel for multiple reminders", () => {
  const reminders: ReminderFlexItem[] = [1, 2].map((id) => ({
    id,
    remindAt: new Date("2026-06-24T09:00:00+08:00"),
    message: `提醒${id}`,
    recurrenceType: "none",
    recurrenceTime: null,
    recurrenceWeekday: null,
    recurrenceDayOfMonth: null,
    isPaused: false,
    skipNextOnce: false,
  }));

  const flex = buildReminderListFlex(reminders);
  assert.ok(flex);
  assert.equal(flex?.type, "flex");
  assert.equal(flex?.contents.type, "carousel");
  if (flex?.contents.type === "carousel") {
    assert.equal(flex.contents.contents.length, 2);
    const button = flex.contents.contents[0]?.footer?.contents[0];
    assert.ok(button && button.type === "button");
    assert.equal(button.action.type, "postback");
  }
});

test("buildReminderListOverflowText appears after carousel limit", () => {
  assert.equal(buildReminderListOverflowText(5), null);
  assert.match(buildReminderListOverflowText(15) ?? "", /前 12 筆/);
});

test("buildReminderListFlex includes recurring control buttons", () => {
  const reminders: ReminderFlexItem[] = [
    {
      id: 9,
      remindAt: new Date("2026-06-24T09:00:00+08:00"),
      message: "喝水",
      recurrenceType: "daily",
      recurrenceTime: "09:00",
      recurrenceWeekday: null,
      recurrenceDayOfMonth: null,
      isPaused: false,
      skipNextOnce: false,
    },
  ];

  const flex = buildReminderListFlex(reminders);
  assert.ok(flex);
  if (flex?.contents.type === "bubble") {
    const labels = flex.contents.footer?.contents
      .filter((item) => item.type === "button")
      .map((item) => (item.type === "button" ? item.action.label : ""));
    assert.deepEqual(labels, ["取消提醒", "暫停重複", "跳過下次"]);
  }
});

test("buildReminderListFlex shows resume button for paused recurring", () => {
  const reminders: ReminderFlexItem[] = [
    {
      id: 10,
      remindAt: new Date("2026-06-24T09:00:00+08:00"),
      message: "開會",
      recurrenceType: "weekly",
      recurrenceTime: "09:00",
      recurrenceWeekday: 1,
      recurrenceDayOfMonth: null,
      isPaused: true,
      skipNextOnce: false,
    },
  ];

  const flex = buildReminderListFlex(reminders);
  assert.ok(flex);
  if (flex?.contents.type === "bubble") {
    const labels = flex.contents.footer?.contents
      .filter((item) => item.type === "button")
      .map((item) => (item.type === "button" ? item.action.label : ""));
    assert.deepEqual(labels, ["取消提醒", "恢復重複"]);
  }
});

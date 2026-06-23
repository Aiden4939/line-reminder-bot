import assert from "node:assert/strict";
import test from "node:test";

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
  const reminders = [1, 2].map((id) => ({
    id,
    remindAt: new Date("2026-06-24T09:00:00+08:00"),
    message: `提醒${id}`,
    recurrenceType: "none",
    recurrenceTime: null,
    recurrenceWeekday: null,
    recurrenceDayOfMonth: null,
  }));

  const flex = buildReminderListFlex(reminders);
  assert.ok(flex);
  assert.equal(flex?.type, "flex");
  assert.equal(flex?.contents.type, "carousel");
  if (flex?.contents.type === "carousel") {
    assert.equal(flex.contents.contents.length, 2);
    const action = flex.contents.contents[0]?.footer?.contents[0]?.action;
    assert.equal(action?.type, "postback");
  }
});

test("buildReminderListOverflowText appears after carousel limit", () => {
  assert.equal(buildReminderListOverflowText(5), null);
  assert.match(buildReminderListOverflowText(15) ?? "", /前 12 筆/);
});

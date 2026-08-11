import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";

const { mapLlmPayload } = await import("./llmReminderParser.js");

test("mapLlmPayload returns invalid_datetime_format for malformed remind_at", () => {
  assert.deepEqual(
    mapLlmPayload({
      action: "create",
      message: "測試",
      remind_at: "2026-06-24 24:30",
    }),
    { type: "help", reason: "invalid_datetime_format" }
  );

  assert.deepEqual(
    mapLlmPayload({
      action: "create",
      message: "測試",
      remind_at: "2026-06-24 25:00",
    }),
    { type: "help", reason: "invalid_datetime_format" }
  );
});

test("mapLlmPayload accepts valid remind_at", () => {
  const result = mapLlmPayload({
    action: "create",
    message: "開會",
    remind_at: "2026-06-24 09:30",
  });
  assert.equal(result?.type, "create");
  if (result?.type === "create") {
    assert.equal(result.message, "開會");
    assert.ok(result.remindAt instanceof Date);
  }
});

test("mapLlmPayload preserves numbered message prefix", () => {
  const result = mapLlmPayload({
    action: "create",
    message: "4.要上課",
    remind_at: "2026-06-24 15:00",
  });
  assert.equal(result?.type, "create");
  if (result?.type === "create") {
    assert.equal(result.message, "4.要上課");
  }
});

test("mapLlmPayload collects time for one-shot reminder with date only", () => {
  assert.deepEqual(
    mapLlmPayload({
      action: "create",
      intent: "create",
      needs_time: true,
      remind_at: "2026-06-29",
      message: "洗衣服",
    }),
    {
      type: "collectTimeForCreate",
      remindDate: "2026-06-29",
      message: "洗衣服",
    }
  );
});

test("mapLlmPayload rejects non-create actions", () => {
  assert.equal(mapLlmPayload({ action: "list" }), null);
  assert.equal(mapLlmPayload({ action: "cancel", cancel_id: 1 }), null);
  assert.equal(mapLlmPayload({ action: "help" }), null);
  assert.equal(mapLlmPayload({ action: "unsupported" }), null);
});

test("mapLlmPayload returns ambiguous help when intent is ambiguous", () => {
  const result = mapLlmPayload(
    {
      action: "create",
      intent: "ambiguous",
      remind_at: "2026-06-29 09:00",
      message: "測試",
    }
  );
  assert.equal(result?.type, "confirmAmbiguousCreate");
  if (result?.type === "confirmAmbiguousCreate") {
    assert.equal(result.message, "測試");
  }
});

test("mapLlmPayload keeps recurring reminder for recurring intent", () => {
  const result = mapLlmPayload(
    {
      action: "create_recurring",
      intent: "create_recurring",
      recurrence_type: "weekly",
      time: "09:00",
      weekday: 1,
      message: "測試",
    }
  );
  assert.equal(result?.type, "createRecurring");
});

test("mapLlmPayload collects time for recurring reminder without time", () => {
  assert.deepEqual(
    mapLlmPayload({
      action: "create_recurring",
      intent: "create_recurring",
      needs_time: true,
      recurrence_type: "weekly",
      weekday: 1,
      message: "洗衣服",
    }),
    {
      type: "collectTimeForRecurring",
      recurrenceType: "weekly",
      weekday: 1,
      dayOfMonth: undefined,
      message: "洗衣服",
    }
  );
});

test("mapLlmPayload converts to one-time when intent is create with confidence", () => {
  const result = mapLlmPayload(
    {
      action: "create_recurring",
      intent: "create",
      confidence: 0.9,
      remind_at: "2026-06-29 09:00",
      message: "測試",
    }
  );
  assert.equal(result?.type, "create");
});

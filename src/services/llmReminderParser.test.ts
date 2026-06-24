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

test("mapLlmPayload rejects non-create actions", () => {
  assert.equal(mapLlmPayload({ action: "list" }), null);
  assert.equal(mapLlmPayload({ action: "cancel", cancel_id: 1 }), null);
  assert.equal(mapLlmPayload({ action: "help" }), null);
  assert.equal(mapLlmPayload({ action: "unsupported" }), null);
});

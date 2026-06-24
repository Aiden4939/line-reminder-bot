import assert from "node:assert/strict";
import test from "node:test";

process.env.TZ = "Asia/Taipei";
process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.NLU_MODE = "rules";

const { processDueReminders } = await import("../jobs/reminderScheduler.js");

test("processDueReminders is exported for scheduler integration", () => {
  assert.equal(typeof processDueReminders, "function");
});

import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.NLU_MODE = "rules";

const { resolveCommand, resolveLlmHybridResult } = await import("./commandResolver.js");

test("resolveCommand uses rules without OpenAI key", async () => {
  process.env.OPENAI_API_KEY = "";
  assert.deepEqual(await resolveCommand("查詢提醒"), { type: "list" });
});

test("resolveCommand recognizes 使用說明 without LLM", async () => {
  process.env.NLU_MODE = "hybrid";
  process.env.OPENAI_API_KEY = "sk-test";
  const cmd = await resolveCommand("使用說明");
  assert.equal(cmd.type, "help");
  if (cmd.type === "help") {
    assert.equal(cmd.reason, "explicit_help");
  }
});

test("resolveCommand hybrid without API key does not call LLM", async () => {
  process.env.NLU_MODE = "hybrid";
  process.env.OPENAI_API_KEY = "";
  const cmd = await resolveCommand("明天下午幫我提醒開會");
  assert.equal(cmd.type, "help");
  if (cmd.type === "help") {
    assert.equal(cmd.reason, undefined);
  }
});

test("resolveLlmHybridResult preserves LLM validation help reasons", () => {
  assert.deepEqual(
    resolveLlmHybridResult({
      type: "help",
      reason: "missing_message",
    }),
    { type: "help", reason: "missing_message" }
  );
  assert.deepEqual(
    resolveLlmHybridResult({
      type: "help",
      reason: "invalid_datetime_format",
    }),
    { type: "help", reason: "invalid_datetime_format" }
  );
});

test("resolveLlmHybridResult preserves collect-time commands", () => {
  assert.deepEqual(
    resolveLlmHybridResult({
      type: "collectTimeForCreate",
      remindDate: "2026-06-29",
      message: "洗衣服",
    }),
    {
      type: "collectTimeForCreate",
      remindDate: "2026-06-29",
      message: "洗衣服",
    }
  );

  assert.deepEqual(
    resolveLlmHybridResult({
      type: "collectTimeForRecurring",
      recurrenceType: "weekly",
      weekday: 1,
      message: "洗衣服",
    }),
    {
      type: "collectTimeForRecurring",
      recurrenceType: "weekly",
      weekday: 1,
      message: "洗衣服",
    }
  );
});

test("resolveLlmHybridResult maps unsupported LLM output to create_failed", () => {
  assert.deepEqual(resolveLlmHybridResult(null), {
    type: "help",
    reason: "create_failed",
  });
});

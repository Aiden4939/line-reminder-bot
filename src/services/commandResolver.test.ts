import assert from "node:assert/strict";
import test from "node:test";

process.env.LINE_CHANNEL_SECRET ||= "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "test-token";
process.env.DB_HOST ||= "localhost";
process.env.DB_NAME ||= "line_reminder";
process.env.DB_USER ||= "appuser";
process.env.DB_PASSWORD ||= "devpassword";
process.env.NLU_MODE = "rules";

const { resolveCommand } = await import("./commandResolver.js");

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

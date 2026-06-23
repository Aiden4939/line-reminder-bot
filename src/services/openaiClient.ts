import OpenAI from "openai";
import type { Fetch } from "openai/core";
import { env } from "../config/env.js";

export function createOpenAiClient(): OpenAI | null {
  if (!env.openaiApiKey) {
    return null;
  }
  return new OpenAI({
    apiKey: env.openaiApiKey,
    fetch: globalThis.fetch as unknown as Fetch,
    timeout: env.llmParseTimeoutMs,
    maxRetries: 0,
  });
}

import { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";
import type { SourceType } from "../types/reminder.js";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: env.lineChannelAccessToken,
});

export async function replyMessage(
  replyToken: string,
  text: string
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}

export async function pushReminder(
  sourceType: SourceType,
  sourceId: string,
  text: string
): Promise<void> {
  await client.pushMessage({
    to: sourceId,
    messages: [{ type: "text", text }],
  });
}

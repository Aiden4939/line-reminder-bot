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
  await replyMessages(replyToken, [text]);
}

export async function replyMessages(
  replyToken: string,
  texts: string[]
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: texts.map((text) => ({ type: "text" as const, text })),
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

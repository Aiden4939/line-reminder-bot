import { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";
import type { SourceType } from "../types/reminder.js";

export type LineMessage = messagingApi.Message;

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: env.lineChannelAccessToken,
});

export async function replyMessage(
  replyToken: string,
  text: string
): Promise<void> {
  await replyMessages(replyToken, [{ type: "text", text }]);
}

export async function replyMessages(
  replyToken: string,
  messages: LineMessage[]
): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  await client.replyMessage({
    replyToken,
    messages: messages.slice(0, 5),
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

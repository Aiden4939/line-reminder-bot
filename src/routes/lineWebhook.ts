import type { WebhookEvent } from "@line/bot-sdk";
import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import * as lineService from "../services/lineService.js";
import {
  handlePostback,
  handleTextMessage,
} from "../services/reminderService.js";
import type { MessageContext } from "../types/reminder.js";
import { verifyLineSignature } from "../utils/lineSignature.js";

export const lineWebhookRouter = Router();

const WEBHOOK_ERROR_REPLY =
  "無法理解您的訊息。時間請用：提醒我 YYYY-MM-DD HH:mm 內容，或自然語言如「明天早上 9 點開會」。";

function getReplyToken(event: WebhookEvent): string | undefined {
  if (event.type === "message" || event.type === "postback") {
    return event.replyToken;
  }
  return undefined;
}

function resolveSource(
  event: WebhookEvent
): Omit<MessageContext, "replyToken"> | null {
  const source = event.source;
  const userId = source.userId;
  if (!userId) {
    return null;
  }

  if (source.type === "user") {
    return {
      sourceType: "user",
      sourceId: userId,
      userId,
    };
  }

  if (source.type === "group" && source.groupId) {
    return {
      sourceType: "group",
      sourceId: source.groupId,
      userId,
    };
  }

  if (source.type === "room" && source.roomId) {
    return {
      sourceType: "room",
      sourceId: source.roomId,
      userId,
    };
  }

  return null;
}

async function dispatchEvent(event: WebhookEvent): Promise<void> {
  const source = resolveSource(event);
  if (!source) {
    return;
  }

  if (event.type === "message" && event.message.type === "text") {
    const context: MessageContext = {
      ...source,
      replyToken: event.replyToken,
    };
    await handleTextMessage(event.message.text, context);
    return;
  }

  if (event.type === "postback") {
    const context: MessageContext = {
      ...source,
      replyToken: event.replyToken,
    };
    await handlePostback(event.postback.data, context);
  }
}

lineWebhookRouter.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["x-line-signature"] as string | undefined;
  const body = req.body as Buffer;

  if (!verifyLineSignature(body, signature, env.lineChannelSecret)) {
    res.status(401).json({ ok: false, error: "Invalid signature" });
    return;
  }

  let events: WebhookEvent[];
  try {
    events = JSON.parse(body.toString("utf8")).events as WebhookEvent[];
  } catch {
    res.status(400).json({ ok: false, error: "Invalid JSON body" });
    return;
  }

  res.status(200).json({ ok: true });

  for (const event of events) {
    try {
      await dispatchEvent(event);
    } catch (error) {
      console.error("[webhook] Failed to handle event:", error);
      const replyToken = getReplyToken(event);
      if (replyToken) {
        try {
          await lineService.replyMessage(replyToken, WEBHOOK_ERROR_REPLY);
        } catch (replyError) {
          console.error("[webhook] Failed to send error reply:", replyError);
        }
      }
    }
  }
});

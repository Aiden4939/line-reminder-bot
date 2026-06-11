import type { WebhookEvent } from "@line/bot-sdk";
import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import { handleTextMessage } from "../services/reminderService.js";
import type { MessageContext } from "../types/reminder.js";
import { verifyLineSignature } from "../utils/lineSignature.js";

export const lineWebhookRouter = Router();

function resolveSource(event: WebhookEvent): Omit<MessageContext, "replyToken"> | null {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

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
    if (event.type !== "message" || event.message.type !== "text") {
      continue;
    }

    const source = resolveSource(event);
    if (!source || !event.replyToken) {
      continue;
    }

    const context: MessageContext = {
      ...source,
      replyToken: event.replyToken,
    };

    try {
      await handleTextMessage(event.message.text, context);
    } catch (error) {
      console.error("[webhook] Failed to handle message:", error);
    }
  }
});

import { addMinutes, parseAbsoluteDateTime } from "../utils/dateParser.js";

export type ParsedCommand =
  | { type: "create"; remindAt: Date; message: string }
  | { type: "list" }
  | { type: "cancel"; id: number }
  | { type: "help" };

const ABSOLUTE_PATTERN =
  /^提醒我\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;
const RELATIVE_PATTERN = /^提醒我\s+(\d+)分鐘後\s+(.+)$/;
const CANCEL_PATTERN = /^取消提醒\s+(\d+)$/;

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  if (trimmed === "查詢提醒") {
    return { type: "list" };
  }

  const absoluteMatch = trimmed.match(ABSOLUTE_PATTERN);
  if (absoluteMatch) {
    const remindAt = parseAbsoluteDateTime(absoluteMatch[1]);
    if (!remindAt) {
      return { type: "help" };
    }
    return {
      type: "create",
      remindAt,
      message: absoluteMatch[2].trim(),
    };
  }

  const relativeMatch = trimmed.match(RELATIVE_PATTERN);
  if (relativeMatch) {
    const minutes = Number(relativeMatch[1]);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return { type: "help" };
    }
    return {
      type: "create",
      remindAt: addMinutes(new Date(), minutes),
      message: relativeMatch[2].trim(),
    };
  }

  const cancelMatch = trimmed.match(CANCEL_PATTERN);
  if (cancelMatch) {
    return { type: "cancel", id: Number(cancelMatch[1]) };
  }

  return { type: "help" };
}

export const HELP_MESSAGE = `提醒 Bot 使用說明：
• 提醒我 YYYY-MM-DD HH:mm 內容
• 提醒我 N分鐘後 內容
• 查詢提醒
• 取消提醒 ID`;

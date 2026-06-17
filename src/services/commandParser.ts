import {
  addMinutes,
  parseAbsoluteDateTime,
  truncateToMinute,
} from "../utils/dateParser.js";

export type ParsedCommand =
  | { type: "create"; remindAt: Date; message: string }
  | { type: "list" }
  | { type: "cancel"; id: number }
  | {
      type: "help";
      reason?:
        | "invalid_datetime_format"
        | "missing_message"
        | "invalid_cancel_id";
    };

const ABSOLUTE_PATTERN =
  /^提醒我\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;
const RELATIVE_PATTERN = /^提醒我\s*(\d+)\s*分鐘後\s+(.+)$/;
const CANCEL_PATTERN = /^取消提醒\s+(\d+)$/;
const CANCEL_ALIAS_PATTERN = /^取消\s+(\d+)$/;
const CANCEL_INVALID_PATTERN = /^取消(?:提醒)?\s+(.+)$/;
const ABSOLUTE_MISSING_MESSAGE_PATTERN =
  /^提醒我\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*$/;
const RELATIVE_MISSING_MESSAGE_PATTERN = /^提醒我\s*\d+\s*分鐘後\s*$/;
const ABSOLUTE_PREFIX_PATTERN = /^提醒我\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/;

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  if (
    trimmed === "查詢提醒" ||
    trimmed === "查詢" ||
    trimmed === "清單"
  ) {
    return { type: "list" };
  }

  if (
    ABSOLUTE_MISSING_MESSAGE_PATTERN.test(trimmed) ||
    RELATIVE_MISSING_MESSAGE_PATTERN.test(trimmed)
  ) {
    return { type: "help", reason: "missing_message" };
  }

  const absoluteMatch = trimmed.match(ABSOLUTE_PATTERN);
  if (absoluteMatch) {
    const remindAt = parseAbsoluteDateTime(absoluteMatch[1]);
    if (!remindAt) {
      return { type: "help", reason: "invalid_datetime_format" };
    }
    return {
      type: "create",
      remindAt: truncateToMinute(remindAt),
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
      remindAt: truncateToMinute(addMinutes(new Date(), minutes)),
      message: relativeMatch[2].trim(),
    };
  }

  const cancelMatch =
    trimmed.match(CANCEL_PATTERN) || trimmed.match(CANCEL_ALIAS_PATTERN);
  if (cancelMatch) {
    return { type: "cancel", id: Number(cancelMatch[1]) };
  }

  const cancelInvalidMatch = trimmed.match(CANCEL_INVALID_PATTERN);
  if (
    cancelInvalidMatch &&
    !Number.isInteger(Number(cancelInvalidMatch[1].trim()))
  ) {
    return { type: "help", reason: "invalid_cancel_id" };
  }

  if (ABSOLUTE_PREFIX_PATTERN.test(trimmed)) {
    return { type: "help", reason: "invalid_datetime_format" };
  }

  return { type: "help" };
}

export const HELP_MESSAGE = `提醒 Bot 使用說明：
• 提醒我 2026-06-20 09:30 開會
• 提醒我 10分鐘後 喝水
• 查詢提醒（或：查詢 / 清單）
• 取消提醒 ID（或：取消 ID）`;

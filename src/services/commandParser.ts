import {
  addMinutes,
  parseAbsoluteDateTime,
  truncateToMinute,
} from "../utils/dateParser.js";
import {
  parseDayOfMonth,
  parseTime,
  parseWeekday,
} from "../utils/recurrence.js";

export type ParsedCommand =
  | { type: "create"; remindAt: Date; message: string }
  | { type: "collectTimeForCreate"; remindDate: string; message: string }
  | {
      type: "confirmAmbiguousCreate";
      message: string;
      onceRemindAt?: Date;
      recurringOption?: {
        recurrenceType: "daily" | "weekly" | "monthly";
        time: string;
        weekday?: number;
        dayOfMonth?: number;
      };
    }
  | {
      type: "createRecurring";
      recurrenceType: "daily" | "weekly" | "monthly";
      time: string;
      weekday?: number;
      dayOfMonth?: number;
      message: string;
    }
  | {
      type: "collectTimeForRecurring";
      recurrenceType: "daily" | "weekly" | "monthly";
      weekday?: number;
      dayOfMonth?: number;
      message: string;
    }
  | { type: "list" }
  | { type: "cancel"; id: number }
  | { type: "enableNotifications" }
  | { type: "disableNotifications" }
  | { type: "startCreateWizard" }
  | {
      type: "help";
      reason?:
        | "invalid_datetime_format"
        | "missing_message"
        | "invalid_cancel_id"
        | "invalid_recurring_time_format"
        | "invalid_weekday"
        | "invalid_day_of_month"
        | "missing_recurring_message"
        | "ambiguous_recurrence"
        | "explicit_help"
        | "create_failed";
    };

const ABSOLUTE_PATTERN =
  /^提醒我\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;
const RELATIVE_PATTERN = /^提醒我\s*(\d+)\s*分鐘後\s+(.+)$/;
const DAILY_PATTERN = /^每天(?:提醒我)?\s*(\d{2}:\d{2})\s+(.+)$/;
const WEEKLY_PATTERN =
  /^每(?:週|星期)(?:星期)?([一二三四五六日天])(?:提醒我)?\s*(\d{2}:\d{2})\s+(.+)$/;
const MONTHLY_PATTERN = /^每月(\d{1,2})日(?:提醒我)?\s*(\d{2}:\d{2})\s+(.+)$/;
const CANCEL_PATTERN = /^取消提醒\s+(\d+)$/;
const CANCEL_ALIAS_PATTERN = /^取消\s+(\d+)$/;
const CANCEL_INVALID_PATTERN = /^取消(?:提醒)?\s+(.+)$/;
const ABSOLUTE_MISSING_MESSAGE_PATTERN =
  /^提醒我\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*$/;
const RELATIVE_MISSING_MESSAGE_PATTERN = /^提醒我\s*\d+\s*分鐘後\s*$/;
const DAILY_MISSING_MESSAGE_PATTERN = /^每天(?:提醒我)?\s*\d{2}:\d{2}\s*$/;
const WEEKLY_MISSING_MESSAGE_PATTERN =
  /^每(?:週|星期)(?:星期)?[一二三四五六日天](?:提醒我)?\s*\d{2}:\d{2}\s*$/;
const MONTHLY_MISSING_MESSAGE_PATTERN =
  /^每月\d{1,2}日(?:提醒我)?\s*\d{2}:\d{2}\s*$/;
const ABSOLUTE_PREFIX_PATTERN = /^提醒我\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/;
const DAILY_PREFIX_PATTERN = /^每天(?:提醒我)?\s*\d{2}:\d{2}/;
const WEEKLY_PREFIX_PATTERN =
  /^每(?:週|星期)(?:星期)?[一二三四五六日天](?:提醒我)?\s*\d{2}:\d{2}/;
const MONTHLY_PREFIX_PATTERN = /^每月\d{1,2}日(?:提醒我)?\s*\d{2}:\d{2}/;

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  if (trimmed === "建立提醒") {
    return { type: "startCreateWizard" };
  }

  if (trimmed === "開啟提醒") {
    return { type: "enableNotifications" };
  }

  if (trimmed === "關閉提醒") {
    return { type: "disableNotifications" };
  }

  if (
    trimmed === "查詢提醒" ||
    trimmed === "查詢" ||
    trimmed === "清單"
  ) {
    return { type: "list" };
  }

  if (
    trimmed === "使用說明" ||
    trimmed === "說明" ||
    trimmed.toLowerCase() === "help"
  ) {
    return { type: "help", reason: "explicit_help" };
  }

  if (
    ABSOLUTE_MISSING_MESSAGE_PATTERN.test(trimmed) ||
    RELATIVE_MISSING_MESSAGE_PATTERN.test(trimmed) ||
    DAILY_MISSING_MESSAGE_PATTERN.test(trimmed) ||
    WEEKLY_MISSING_MESSAGE_PATTERN.test(trimmed) ||
    MONTHLY_MISSING_MESSAGE_PATTERN.test(trimmed)
  ) {
    return {
      type: "help",
      reason: trimmed.startsWith("每天") ||
        trimmed.startsWith("每週") ||
        trimmed.startsWith("每星期") ||
        trimmed.startsWith("每月")
        ? "missing_recurring_message"
        : "missing_message",
    };
  }

  const dailyMatch = trimmed.match(DAILY_PATTERN);
  if (dailyMatch) {
    const time = parseTime(dailyMatch[1]);
    if (!time) {
      return { type: "help", reason: "invalid_recurring_time_format" };
    }
    return {
      type: "createRecurring",
      recurrenceType: "daily",
      time,
      message: dailyMatch[2].trim(),
    };
  }

  const weeklyMatch = trimmed.match(WEEKLY_PATTERN);
  if (weeklyMatch) {
    const weekday = parseWeekday(weeklyMatch[1]);
    const time = parseTime(weeklyMatch[2]);
    if (!weekday) {
      return { type: "help", reason: "invalid_weekday" };
    }
    if (!time) {
      return { type: "help", reason: "invalid_recurring_time_format" };
    }
    return {
      type: "createRecurring",
      recurrenceType: "weekly",
      time,
      weekday,
      message: weeklyMatch[3].trim(),
    };
  }

  const monthlyMatch = trimmed.match(MONTHLY_PATTERN);
  if (monthlyMatch) {
    const dayOfMonth = parseDayOfMonth(monthlyMatch[1]);
    const time = parseTime(monthlyMatch[2]);
    if (!dayOfMonth) {
      return { type: "help", reason: "invalid_day_of_month" };
    }
    if (!time) {
      return { type: "help", reason: "invalid_recurring_time_format" };
    }
    return {
      type: "createRecurring",
      recurrenceType: "monthly",
      time,
      dayOfMonth,
      message: monthlyMatch[3].trim(),
    };
  }

  const absoluteMatch = trimmed.match(ABSOLUTE_PATTERN);
  if (absoluteMatch) {
    const remindAt = parseAbsoluteDateTime(absoluteMatch[1]);
    if (!remindAt) {
      return { type: "help", reason: "invalid_datetime_format" };
    }
    const truncated = truncateToMinute(remindAt);
    if (!truncated) {
      return { type: "help", reason: "invalid_datetime_format" };
    }
    return {
      type: "create",
      remindAt: truncated,
      message: absoluteMatch[2].trim(),
    };
  }

  const relativeMatch = trimmed.match(RELATIVE_PATTERN);
  if (relativeMatch) {
    const minutes = Number(relativeMatch[1]);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return { type: "help" };
    }
    const truncated = truncateToMinute(addMinutes(new Date(), minutes));
    if (!truncated) {
      return { type: "help", reason: "invalid_datetime_format" };
    }
    return {
      type: "create",
      remindAt: truncated,
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
  if (
    DAILY_PREFIX_PATTERN.test(trimmed) ||
    WEEKLY_PREFIX_PATTERN.test(trimmed) ||
    MONTHLY_PREFIX_PATTERN.test(trimmed)
  ) {
    return { type: "help", reason: "invalid_recurring_time_format" };
  }

  return { type: "help" };
}

export function isInterruptingCommand(text: string): boolean {
  const command = parseCommand(text.trim());
  if (command.type === "help" && command.reason === undefined) {
    return false;
  }
  return true;
}

export const HELP_MESSAGE = `提醒 Bot 使用說明：
• 建立提醒 — 以選單逐步建立（可選快捷時間：30分鐘後、1小時後、明天09:00）
• 提醒我 2026-06-20 09:30 開會
• 提醒我 10分鐘後 喝水
• 明天早上 9 點開會（自然語言，需設定 OPENAI_API_KEY）
• 每天 09:00 喝水（或：每天提醒我 09:00 喝水）
• 每週一 09:00 開會（或：每週一提醒我 09:00 開會）
• 每月15日 09:00 繳費（或：每月15日提醒我 09:00 繳費）
• 查詢提醒（或：查詢 / 清單）— 以卡片顯示，可修改時間或取消
• 取消提醒 ID（或：取消 ID）
• 開啟提醒 / 關閉提醒 — 全域暫停或恢復 push 通知
• 底部選單：建立提醒 | 查詢提醒 | 使用說明 | 指令範例`;

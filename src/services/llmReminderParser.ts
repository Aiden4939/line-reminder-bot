import { env } from "../config/env.js";
import {
  addMinutes,
  parseAbsoluteDateTime,
  truncateToMinute,
} from "../utils/dateParser.js";
import { parseDayOfMonth, parseTime, parseWeekday } from "../utils/recurrence.js";
import type { ParsedCommand } from "./commandParser.js";
import { createOpenAiClient } from "./openaiClient.js";

interface LlmReminderPayload {
  action?: string;
  message?: string;
  remind_at?: string;
  minutes_from_now?: number;
  hours_from_now?: number;
  recurrence_type?: string;
  time?: string;
  weekday?: number | string;
  day_of_month?: number;
  cancel_id?: number;
}

function currentTimeLabel(): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function parseRemindAt(payload: LlmReminderPayload): Date | null {
  if (
    typeof payload.minutes_from_now === "number" &&
    payload.minutes_from_now > 0
  ) {
    return truncateToMinute(addMinutes(new Date(), payload.minutes_from_now));
  }

  if (typeof payload.hours_from_now === "number" && payload.hours_from_now > 0) {
    return truncateToMinute(
      addMinutes(new Date(), Math.round(payload.hours_from_now * 60))
    );
  }

  if (typeof payload.remind_at === "string" && payload.remind_at.trim()) {
    const raw = payload.remind_at.trim();
    const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (localMatch) {
      const local = parseAbsoluteDateTime(`${localMatch[1]} ${localMatch[2]}`);
      if (local) {
        return truncateToMinute(local);
      }
      return null;
    }
    if (/[zZ]$|[+-]\d{2}(?::\d{2})?$/.test(raw)) {
      const iso = new Date(raw);
      if (!Number.isNaN(iso.getTime())) {
        return truncateToMinute(iso);
      }
    }
  }

  return null;
}

export function mapLlmPayload(payload: LlmReminderPayload): ParsedCommand | null {
  const action = payload.action?.trim().toLowerCase();
  if (!action) {
    return null;
  }

  if (action === "list") {
    return { type: "list" };
  }

  if (action === "help") {
    return { type: "help" };
  }

  if (action === "cancel") {
    const id = Number(payload.cancel_id);
    if (!Number.isInteger(id) || id <= 0) {
      return { type: "help", reason: "invalid_cancel_id" };
    }
    return { type: "cancel", id };
  }

  if (action === "create") {
    const message = payload.message?.trim();
    if (!message) {
      return { type: "help", reason: "missing_message" };
    }
    const remindAt = parseRemindAt(payload);
    if (!remindAt) {
      return { type: "help", reason: "invalid_datetime_format" };
    }
    return { type: "create", remindAt, message };
  }

  if (action === "create_recurring" || action === "createrecurring") {
    const message = payload.message?.trim();
    if (!message) {
      return { type: "help", reason: "missing_recurring_message" };
    }

    const recurrenceType = payload.recurrence_type?.trim().toLowerCase();
    if (
      recurrenceType !== "daily" &&
      recurrenceType !== "weekly" &&
      recurrenceType !== "monthly"
    ) {
      return { type: "help", reason: "invalid_recurring_time_format" };
    }

    const time = payload.time ? parseTime(payload.time) : null;
    if (!time) {
      return { type: "help", reason: "invalid_recurring_time_format" };
    }

    if (recurrenceType === "weekly") {
      const weekday =
        typeof payload.weekday === "number"
          ? payload.weekday >= 1 && payload.weekday <= 7
            ? payload.weekday
            : null
          : typeof payload.weekday === "string"
            ? parseWeekday(payload.weekday)
            : null;
      if (!weekday) {
        return { type: "help", reason: "invalid_weekday" };
      }
      return {
        type: "createRecurring",
        recurrenceType: "weekly",
        time,
        weekday,
        message,
      };
    }

    if (recurrenceType === "monthly") {
      const dayOfMonth =
        typeof payload.day_of_month === "number"
          ? parseDayOfMonth(String(payload.day_of_month))
          : null;
      if (!dayOfMonth) {
        return { type: "help", reason: "invalid_day_of_month" };
      }
      return {
        type: "createRecurring",
        recurrenceType: "monthly",
        time,
        dayOfMonth,
        message,
      };
    }

    return {
      type: "createRecurring",
      recurrenceType: "daily",
      time,
      message,
    };
  }

  return null;
}

export async function parseCommandWithLlm(
  text: string
): Promise<ParsedCommand | null> {
  const openai = createOpenAiClient();
  if (!openai) {
    return null;
  }

  try {
    const completion = await openai.chat.completions.create(
      {
      model: env.llmModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是 LINE 提醒 Bot 的指令解析器。只回傳 JSON，不要其他文字。",
            `現在時間：${currentTimeLabel()}（時區 ${env.tz}）`,
            "",
            "JSON 格式：",
            '{"action":"create|create_recurring|list|cancel|help",',
            '"message":"提醒內容（create 必填）",',
            '"remind_at":"YYYY-MM-DD HH:mm 或 ISO8601（一次性提醒，hour 0-23、minute 0-59）",',
            '"minutes_from_now":數字,',
            '"hours_from_now":數字,',
            '"recurrence_type":"daily|weekly|monthly",',
            '"time":"HH:mm",',
            '"weekday":1-7或「一」到「日」,',
            '"day_of_month":1-31,',
            '"cancel_id":數字}',
            "",
            "規則：",
            "- 查詢/列出提醒 → action=list",
            "- 取消第 N 個 → action=cancel, cancel_id=N",
            "- 明天早上九點開會 → action=create, message=開會, remind_at=推算後的 YYYY-MM-DD HH:mm",
            "- 兩小時後喝水 → action=create, hours_from_now=2, message=喝水",
            "- 每天九點喝水 → action=create_recurring, recurrence_type=daily, time=09:00, message=喝水",
            "- 無法判斷 → action=help",
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
      },
      { timeout: env.llmParseTimeoutMs }
    );

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }

    try {
      const payload = JSON.parse(content) as LlmReminderPayload;
      return mapLlmPayload(payload);
    } catch (error) {
      console.warn("[nlu] Failed to parse LLM JSON:", error);
      return null;
    }
  } catch (error) {
    console.error("[nlu] OpenAI request failed:", error);
    return null;
  }
}

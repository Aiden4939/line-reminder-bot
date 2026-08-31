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
  intent?: string;
  confidence?: number;
  message?: string;
  remind_at?: string;
  needs_time?: boolean;
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

function parseRemindDate(payload: LlmReminderPayload): string | null {
  if (typeof payload.remind_at !== "string" || !payload.remind_at.trim()) {
    return null;
  }
  const match = payload.remind_at.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function isDateOnlyRemindAt(remindAt: string): boolean {
  const raw = remindAt.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function parseRecurringOption(payload: LlmReminderPayload): {
  recurrenceType: "daily" | "weekly" | "monthly";
  time: string;
  weekday?: number;
  dayOfMonth?: number;
} | null {
  const recurrenceType = payload.recurrence_type?.trim().toLowerCase();
  if (
    recurrenceType !== "daily" &&
    recurrenceType !== "weekly" &&
    recurrenceType !== "monthly"
  ) {
    return null;
  }
  const time = payload.time ? parseTime(payload.time) : null;
  if (!time) {
    return null;
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
      return null;
    }
    return { recurrenceType: "weekly", time, weekday };
  }
  if (recurrenceType === "monthly") {
    const dayOfMonth =
      typeof payload.day_of_month === "number"
        ? parseDayOfMonth(String(payload.day_of_month))
        : null;
    if (!dayOfMonth) {
      return null;
    }
    return { recurrenceType: "monthly", time, dayOfMonth };
  }
  return { recurrenceType: "daily", time };
}

function parseRecurringDraft(payload: LlmReminderPayload): {
  recurrenceType: "daily" | "weekly" | "monthly";
  weekday?: number;
  dayOfMonth?: number;
} | null {
  const recurrenceType = payload.recurrence_type?.trim().toLowerCase();
  if (
    recurrenceType !== "daily" &&
    recurrenceType !== "weekly" &&
    recurrenceType !== "monthly"
  ) {
    return null;
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
      return null;
    }
    return { recurrenceType: "weekly", weekday };
  }
  if (recurrenceType === "monthly") {
    const dayOfMonth =
      typeof payload.day_of_month === "number"
        ? parseDayOfMonth(String(payload.day_of_month))
        : null;
    if (!dayOfMonth) {
      return null;
    }
    return { recurrenceType: "monthly", dayOfMonth };
  }
  return { recurrenceType: "daily" };
}

export function mapLlmPayload(
  payload: LlmReminderPayload,
  _originalText = ""
): ParsedCommand | null {
  const action = payload.action?.trim().toLowerCase();
  const intent = payload.intent?.trim().toLowerCase();
  const confidence =
    typeof payload.confidence === "number" ? payload.confidence : null;
  if (!action) {
    return null;
  }

  if (action === "unsupported" || action === "help" || action === "list" || action === "cancel") {
    return null;
  }

  if (intent === "ambiguous") {
    const message = payload.message?.trim();
    if (!message) {
      return { type: "help", reason: "missing_message" };
    }
    const onceRemindAt = parseRemindAt(payload) ?? undefined;
    const recurringOption = parseRecurringOption(payload) ?? undefined;
    if (!onceRemindAt && !recurringOption) {
      return { type: "help", reason: "ambiguous_recurrence" };
    }
    return {
      type: "confirmAmbiguousCreate",
      message,
      onceRemindAt,
      recurringOption,
    };
  }

  if (action === "create") {
    const message = payload.message?.trim();
    if (!message) {
      return { type: "help", reason: "missing_message" };
    }
    const remindDate = parseRemindDate(payload);
    const remindAtRaw = payload.remind_at?.trim();
    if (
      payload.needs_time === true ||
      (remindAtRaw && isDateOnlyRemindAt(remindAtRaw))
    ) {
      if (!remindDate) {
        return { type: "help", reason: "invalid_datetime_format" };
      }
      return { type: "collectTimeForCreate", remindDate, message };
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

    if (intent === "create" && confidence !== null && confidence >= 0.6) {
      if (payload.needs_time === true) {
        const remindDate = parseRemindDate(payload);
        if (!remindDate) {
          return { type: "help", reason: "invalid_datetime_format" };
        }
        return { type: "collectTimeForCreate", remindDate, message };
      }
      const remindAt = parseRemindAt(payload);
      if (!remindAt) {
        return { type: "help", reason: "invalid_datetime_format" };
      }
      return { type: "create", remindAt, message };
    }

    const recurringOption = parseRecurringOption(payload);
    if (!recurringOption) {
      if (payload.needs_time === true || !payload.time) {
        const recurringDraft = parseRecurringDraft(payload);
        if (recurringDraft) {
          return {
            type: "collectTimeForRecurring",
            recurrenceType: recurringDraft.recurrenceType,
            weekday: recurringDraft.weekday,
            dayOfMonth: recurringDraft.dayOfMonth,
            message,
          };
        }
      }
      return { type: "help", reason: "invalid_recurring_time_format" };
    }
    return {
      type: "createRecurring",
      recurrenceType: recurringOption.recurrenceType,
      time: recurringOption.time,
      weekday: recurringOption.weekday,
      dayOfMonth: recurringOption.dayOfMonth,
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
            "你是 LINE 提醒 Bot 的指令解析器，僅負責解析「建立提醒」意圖。只回傳 JSON，不要其他文字。",
            `現在時間：${currentTimeLabel()}（時區 ${env.tz}）`,
            "",
            "JSON 格式：",
            '{"action":"create|create_recurring|unsupported",',
            '"intent":"create|create_recurring|ambiguous",',
            '"confidence":0到1的小數（對 intent 的信心）',
            '"message":"提醒內容（create 必填）",',
            '"remind_at":"YYYY-MM-DD HH:mm 或 ISO8601（一次性提醒，hour 0-23、minute 0-59）",',
            '"needs_time":true|false（已知道日期或週期但缺少幾點幾分時為 true）,',
            '"minutes_from_now":數字,',
            '"hours_from_now":數字,',
            '"recurrence_type":"daily|weekly|monthly",',
            '"time":"HH:mm",',
            '"weekday":1-7或「一」到「日」,',
            '"day_of_month":1-31}',
            "",
            "規則：",
            "- 僅處理建立一次性或重複提醒",
            "- 查詢、取消、說明、閒聊、無法判斷 → action=unsupported",
            "- 先判斷 intent：一次性(create)、重複(create_recurring)、或模糊(ambiguous)",
            "- 文字可能有口語變體，不可只靠固定關鍵字；若無法確定是否重複，intent 必須回 ambiguous",
            "- 下週一/下禮拜一/這週五/明天/後天通常是一次性，除非語意明確表示每週重複",
            "- 一次性提醒如果有日期但沒有幾點幾分，不可猜時間；回 action=create, intent=create, needs_time=true, remind_at=YYYY-MM-DD, message=提醒內容",
            "- 重複提醒如果有頻率但沒有幾點幾分，不可猜時間；回 action=create_recurring, intent=create_recurring, needs_time=true, recurrence_type/weekday/day_of_month/message",
            "- 句子同時出現多個時間時：以「提醒我」為分界；前面的時間才是 remind_at，後面的時間屬於 message 內容",
            "- 9/5中午提醒我明天要吃飯 → action=create, message=明天要吃飯, remind_at=當年9/5 12:00（不可把 message 裡的「明天」當 remind_at）",
            "- 8/20早上9點提醒我9/1要交報告 → action=create, message=9/1要交報告, remind_at=當年8/20 09:00",
            "- 使用者文字含「提醒我」時，「提醒我」後面的文字通常就是 message，必須盡量原樣保留",
            "- message 可以用數字、標點、序號開頭，例如「4.要上課」；不可因為像清單編號就丟棄或改寫",
            "- 時間詞後的數字加句點可能表示「點」，例如「下午3.提醒我...」應理解為「下午3點提醒我...」",
            "- 明天早上九點開會 → action=create, message=開會, remind_at=推算後的 YYYY-MM-DD HH:mm",
            "- 明天提醒我要吃飯 → action=create, intent=create, needs_time=true, remind_at=推算後的明天 YYYY-MM-DD, message=吃飯",
            "- 下個禮拜四下午3.提醒我4.要上課 → action=create, message=4.要上課, remind_at=推算後的下個禮拜四 15:00",
            "- 下禮拜一提醒我要測試 → action=create, intent=create, needs_time=true, remind_at=推算後的下禮拜一 YYYY-MM-DD, message=測試",
            "- 每個禮拜一提醒我要測試 → action=create_recurring, intent=create_recurring, needs_time=true, recurrence_type=weekly, weekday=1, message=測試",
            "- 每個禮拜一 09:00 提醒我要測試 → action=create_recurring, intent=create_recurring, recurrence_type=weekly, weekday=1, time=09:00, message=測試",
            "- 兩小時後喝水 → action=create, hours_from_now=2, message=喝水",
            "- 每天九點喝水 → action=create_recurring, recurrence_type=daily, time=09:00, message=喝水",
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
      return mapLlmPayload(payload, text);
    } catch (error) {
      console.warn("[nlu] Failed to parse LLM JSON:", error);
      return null;
    }
  } catch (error) {
    console.error("[nlu] OpenAI request failed:", error);
    return null;
  }
}

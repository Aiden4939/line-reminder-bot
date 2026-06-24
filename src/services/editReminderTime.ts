import type { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import type { MessageContext, Reminder } from "../types/reminder.js";
import {
  addMinutes,
  parseAbsoluteDateTime,
  truncateToMinute,
} from "../utils/dateParser.js";
import {
  computeFirstRemindAt,
  parseTime,
  type RecurrenceRule,
} from "../utils/recurrence.js";
import type { ReminderFlexItem } from "./flexMessageBuilder.js";
import { buildReminderFlex } from "./flexMessageBuilder.js";
import type { LineMessage } from "./lineService.js";
import * as lineService from "./lineService.js";
import {
  buildEditTimeNotFoundMessage,
  buildEditTimePastMessage,
  buildEditTimeSuccessMessage,
  buildCreateSuccessMessage,
} from "./reminderMessages.js";

type FlexMessage = messagingApi.FlexMessage;

export function reminderToFlexItem(reminder: Reminder): ReminderFlexItem {
  return {
    id: reminder.id,
    remindAt: reminder.remindAt,
    message: reminder.message,
    recurrenceType: reminder.recurrenceType,
    recurrenceTime: reminder.recurrenceTime,
    recurrenceWeekday: reminder.recurrenceWeekday,
    recurrenceDayOfMonth: reminder.recurrenceDayOfMonth,
    isPaused: reminder.isPaused,
    skipNextOnce: reminder.skipNextOnce,
  };
}

function formatDatetimeInitial(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T");
}

function formatTimeInitial(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function parseDatetimePickerValue(value: string): Date | null {
  const normalized = value.includes("T")
    ? value.replace("T", " ").slice(0, 16)
    : value;
  const localMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
  if (!localMatch) {
    return null;
  }
  const datePart = localMatch[1];
  const timePart = localMatch[2] ?? "00:00";
  const parsed = parseAbsoluteDateTime(`${datePart} ${timePart}`);
  return parsed ? truncateToMinute(parsed) : null;
}

function parseTimePickerValue(value: string): string | null {
  const match = value.match(/(?:T|\s)(\d{2}:\d{2})/);
  const time = match?.[1] ?? value;
  return parseTime(time);
}

export function buildEditTimePickerFlex(reminder: Reminder): FlexMessage {
  const isOnce = reminder.recurrenceType === "none";
  const initial = isOnce
    ? formatDatetimeInitial(reminder.remindAt)
    : formatTimeInitial(reminder.remindAt);

  return {
    type: "flex",
    altText: `修改提醒 #${reminder.id} 的時間`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `修改提醒 #${reminder.id}`,
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: reminder.message,
            size: "sm",
            color: "#666666",
            wrap: true,
          },
          {
            type: "text",
            text: isOnce
              ? "請選擇新的日期與時間"
              : "請選擇新的重複時間（永久修改）",
            size: "sm",
            color: "#888888",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: {
              type: "datetimepicker",
              label: isOnce ? "選擇日期時間" : "選擇時間",
              data: `action=edit_time_submit&id=${reminder.id}`,
              mode: isOnce ? "datetime" : "time",
              initial,
            },
          },
        ],
      },
    },
  };
}

async function replyEditTimeSuccess(
  replyToken: string,
  reminder: Reminder
): Promise<void> {
  const messages: LineMessage[] = [
    { type: "text", text: buildEditTimeSuccessMessage(reminder) },
  ];
  if (env.flexListEnabled) {
    messages.push(buildReminderFlex(reminderToFlexItem(reminder)));
  }
  await lineService.replyMessages(replyToken, messages);
}

export async function replyCreateSuccess(
  replyToken: string,
  reminder: Reminder
): Promise<void> {
  const messages: LineMessage[] = [
    { type: "text", text: buildCreateSuccessMessage(reminder) },
  ];
  if (env.flexListEnabled) {
    messages.push(buildReminderFlex(reminderToFlexItem(reminder)));
  }
  await lineService.replyMessages(replyToken, messages);
}

export async function handleEditTimeRequest(
  id: number,
  context: MessageContext
): Promise<void> {
  const reminder = await reminderRepository.findReminderById(
    id,
    context.sourceType,
    context.sourceId,
    context.userId
  );

  if (!reminder || reminder.status !== "pending") {
    await lineService.replyMessage(
      context.replyToken,
      buildEditTimeNotFoundMessage(id)
    );
    return;
  }

  await lineService.replyMessages(context.replyToken, [
    buildEditTimePickerFlex(reminder),
  ]);
}

export async function handleEditTimeSubmit(
  id: number,
  params: Record<string, string>,
  context: MessageContext
): Promise<void> {
  const reminder = await reminderRepository.findReminderById(
    id,
    context.sourceType,
    context.sourceId,
    context.userId
  );

  if (!reminder || reminder.status !== "pending") {
    await lineService.replyMessage(
      context.replyToken,
      buildEditTimeNotFoundMessage(id)
    );
    return;
  }

  if (reminder.recurrenceType === "none") {
    const datetime = params.datetime;
    if (!datetime) {
      await lineService.replyMessage(
        context.replyToken,
        "請點擊按鈕選擇新的日期時間。"
      );
      return;
    }

    const remindAt = parseDatetimePickerValue(datetime);
    if (!remindAt || remindAt <= new Date()) {
      await lineService.replyMessage(context.replyToken, buildEditTimePastMessage());
      return;
    }

    const updated = await reminderRepository.updateOnceReminderTime(
      id,
      context.sourceType,
      context.sourceId,
      context.userId,
      remindAt
    );
    if (!updated) {
      await lineService.replyMessage(
        context.replyToken,
        buildEditTimeNotFoundMessage(id)
      );
      return;
    }

    await replyEditTimeSuccess(context.replyToken, updated);
    return;
  }

  const timeRaw = params.time;
  if (!timeRaw) {
    await lineService.replyMessage(
      context.replyToken,
      "請點擊按鈕選擇新的時間。"
    );
    return;
  }

  const time = parseTimePickerValue(timeRaw);
  if (!time) {
    await lineService.replyMessage(
      context.replyToken,
      "時間格式錯誤，請重新選擇。"
    );
    return;
  }

  const rule: RecurrenceRule = {
    recurrenceType: reminder.recurrenceType as "daily" | "weekly" | "monthly",
    time,
    weekday: reminder.recurrenceWeekday ?? undefined,
    dayOfMonth: reminder.recurrenceDayOfMonth ?? undefined,
  };
  const remindAt = computeFirstRemindAt(new Date(), rule);
  if (remindAt <= new Date()) {
    await lineService.replyMessage(context.replyToken, buildEditTimePastMessage());
    return;
  }

  const updated = await reminderRepository.updateRecurringReminderTime(
    id,
    context.sourceType,
    context.sourceId,
    context.userId,
    time,
    remindAt
  );
  if (!updated) {
    await lineService.replyMessage(
      context.replyToken,
      buildEditTimeNotFoundMessage(id)
    );
    return;
  }

  await replyEditTimeSuccess(context.replyToken, updated);
}

export function resolveQuickPickDatetime(value: string): string | null {
  const now = new Date();
  if (value === "30m") {
    return formatDatetimeInitial(addMinutes(now, 30));
  }
  if (value === "1h") {
    return formatDatetimeInitial(addMinutes(now, 60));
  }
  if (value === "tomorrow9") {
    const tomorrow = addMinutes(now, 24 * 60);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: env.tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(tomorrow);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) {
      return null;
    }
    const parsed = parseAbsoluteDateTime(`${year}-${month}-${day} 09:00`);
    if (!parsed) {
      return null;
    }
    return formatDatetimeInitial(parsed);
  }
  return null;
}

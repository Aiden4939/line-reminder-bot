import * as reminderRepository from "../repositories/reminderRepository.js";
import type { Reminder } from "../types/reminder.js";
import type { MessageContext } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import {
  computeFirstRemindAt,
  formatRecurrenceSchedule,
  formatRecurrenceTypeLabel,
  type RecurrenceRule,
} from "../utils/recurrence.js";
import { env } from "../config/env.js";
import { HELP_MESSAGE, type ParsedCommand } from "./commandParser.js";
import { resolveCommand } from "./commandResolver.js";
import {
  buildReminderListFlex,
  buildReminderListOverflowText,
} from "./flexMessageBuilder.js";
import type { LineMessage } from "./lineService.js";
import * as lineService from "./lineService.js";

const MAX_LIST_ITEMS_PER_MESSAGE = 10;

type ReminderListItem = Pick<
  Reminder,
  | "id"
  | "remindAt"
  | "message"
  | "recurrenceType"
  | "recurrenceTime"
  | "recurrenceWeekday"
  | "recurrenceDayOfMonth"
>;

function formatListLine(reminder: ReminderListItem): string {
  const schedule = formatRecurrenceSchedule(reminder);
  if (schedule) {
    return `#${reminder.id} | ${schedule} | ${reminder.message}（下次：${formatDateTime(reminder.remindAt)}）`;
  }
  return `#${reminder.id} | ${formatDateTime(reminder.remindAt)} | ${reminder.message}`;
}

export function buildCreateSuccessMessage(reminder: ReminderListItem): string {
  const schedule = formatRecurrenceSchedule(reminder);
  if (schedule) {
    const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
    return `已建立${typeLabel}提醒 #${reminder.id}，首次於 ${formatDateTime(reminder.remindAt)}，之後${schedule} 重複：${reminder.message}\n可點選單「查詢提醒」或輸入「取消提醒 ${reminder.id}」取消。`;
  }
  return `已建立提醒 #${reminder.id}，將於 ${formatDateTime(reminder.remindAt)} 提醒您：${reminder.message}\n可點選單「查詢提醒」或輸入「取消提醒 ${reminder.id}」取消。`;
}

export function buildReminderListMessages(
  reminders: ReminderListItem[]
): string[] {
  const chunks: ReminderListItem[][] = [];
  let start = 0;
  while (start < reminders.length) {
    chunks.push(reminders.slice(start, start + MAX_LIST_ITEMS_PER_MESSAGE));
    start += MAX_LIST_ITEMS_PER_MESSAGE;
  }

  return chunks.map((group, index) => {
    const title =
      chunks.length === 1
        ? `待發送提醒（共 ${reminders.length} 筆）：`
        : `待發送提醒（第 ${index + 1}/${chunks.length} 段，共 ${reminders.length} 筆）：`;
    const lines = group.map(formatListLine);
    return `${title}\n${lines.join("\n")}`;
  });
}

export function buildCancelNotFoundMessage(id: number): string {
  return `找不到可取消的提醒 #${id}，請先輸入「查詢提醒」確認 ID 是否存在且狀態為待發送。`;
}

export function buildCancelSuccessMessage(reminder: ReminderListItem): string {
  const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
  if (typeLabel) {
    return `已取消${typeLabel}提醒 #${reminder.id}。`;
  }
  return `已取消提醒 #${reminder.id}。`;
}

export function buildHelpMessage(
  reason?:
    | "invalid_datetime_format"
    | "missing_message"
    | "invalid_cancel_id"
    | "invalid_recurring_time_format"
    | "invalid_weekday"
    | "invalid_day_of_month"
    | "missing_recurring_message"
    | "explicit_help"
): string {
  if (reason === "invalid_datetime_format") {
    return "時間格式錯誤，請用：提醒我 YYYY-MM-DD HH:mm 內容\n例如：提醒我 2026-06-20 09:30 開會\n也可用自然語言：明天早上 9 點開會";
  }
  if (reason === "missing_message") {
    return "請補上提醒內容。\n例如：提醒我 10分鐘後 喝水";
  }
  if (reason === "invalid_cancel_id") {
    return "取消提醒的 ID 必須是數字。\n例如：取消提醒 12";
  }
  if (reason === "invalid_recurring_time_format") {
    return "重複提醒時間格式錯誤，請用 HH:mm。\n例如：每天 09:00 喝水";
  }
  if (reason === "invalid_weekday") {
    return "每週提醒的星期格式錯誤。\n例如：每週一 09:00 開會";
  }
  if (reason === "invalid_day_of_month") {
    return "每月提醒的日期必須是 1-31。\n例如：每月15日 09:00 繳費";
  }
  if (reason === "missing_recurring_message") {
    return "請補上提醒內容。\n例如：每天 09:00 喝水";
  }
  return HELP_MESSAGE;
}

async function replyReminderList(
  replyToken: string,
  reminders: ReminderListItem[]
): Promise<void> {
  if (env.flexListEnabled) {
    const flex = buildReminderListFlex(reminders);
    if (flex) {
      const messages: LineMessage[] = [flex];
      const overflow = buildReminderListOverflowText(reminders.length);
      if (overflow) {
        messages.push({ type: "text", text: overflow });
      }
      await lineService.replyMessages(replyToken, messages);
      return;
    }
  }

  const listMessages = buildReminderListMessages(reminders);
  await lineService.replyMessages(
    replyToken,
    listMessages.map((text) => ({ type: "text", text }))
  );
}

async function executeCommand(
  command: ParsedCommand,
  context: MessageContext
): Promise<void> {
  switch (command.type) {
    case "create": {
      if (command.remindAt <= new Date()) {
        await lineService.replyMessage(
          context.replyToken,
          "提醒時間必須晚於現在，請重新輸入。"
        );
        return;
      }

      const reminder = await reminderRepository.createReminder({
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        userId: context.userId,
        message: command.message,
        remindAt: command.remindAt,
      });

      await lineService.replyMessage(
        context.replyToken,
        buildCreateSuccessMessage(reminder)
      );
      return;
    }

    case "createRecurring": {
      const rule: RecurrenceRule = {
        recurrenceType: command.recurrenceType,
        time: command.time,
        weekday: command.weekday,
        dayOfMonth: command.dayOfMonth,
      };
      const remindAt = computeFirstRemindAt(new Date(), rule);
      if (remindAt <= new Date()) {
        await lineService.replyMessage(
          context.replyToken,
          "提醒時間必須晚於現在，請重新輸入。"
        );
        return;
      }

      const reminder = await reminderRepository.createReminder({
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        userId: context.userId,
        message: command.message,
        remindAt,
        recurrenceType: command.recurrenceType,
        recurrenceTime: command.time,
        recurrenceWeekday: command.weekday ?? null,
        recurrenceDayOfMonth: command.dayOfMonth ?? null,
      });

      await lineService.replyMessage(
        context.replyToken,
        buildCreateSuccessMessage(reminder)
      );
      return;
    }

    case "list": {
      const reminders = await reminderRepository.findPendingBySourceAndUser(
        context.sourceType,
        context.sourceId,
        context.userId
      );

      if (reminders.length === 0) {
        await lineService.replyMessage(context.replyToken, "目前沒有待發送的提醒。");
        return;
      }

      await replyReminderList(context.replyToken, reminders);
      return;
    }

    case "cancel": {
      const cancelled = await reminderRepository.cancelReminder(
        command.id,
        context.sourceType,
        context.sourceId,
        context.userId
      );

      if (!cancelled) {
        await lineService.replyMessage(
          context.replyToken,
          buildCancelNotFoundMessage(command.id)
        );
        return;
      }

      await lineService.replyMessage(
        context.replyToken,
        buildCancelSuccessMessage(cancelled)
      );
      return;
    }

    case "help":
    default:
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage(command.reason)
      );
  }
}

export async function handleTextMessage(
  text: string,
  context: MessageContext
): Promise<void> {
  const command = await resolveCommand(text);
  await executeCommand(command, context);
}

export async function handlePostback(
  data: string,
  context: MessageContext
): Promise<void> {
  const params = new URLSearchParams(data);
  const action = params.get("action");

  if (action === "help") {
    await lineService.replyMessage(context.replyToken, HELP_MESSAGE);
    return;
  }

  if (action === "cancel") {
    const id = Number(params.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    await executeCommand({ type: "cancel", id }, context);
    return;
  }

  await lineService.replyMessage(
    context.replyToken,
    "無法識別的操作，請使用底部選單或輸入「使用說明」。"
  );
}

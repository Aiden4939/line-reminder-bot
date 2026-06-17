import * as reminderRepository from "../repositories/reminderRepository.js";
import type { Reminder } from "../types/reminder.js";
import type { MessageContext } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import { HELP_MESSAGE, parseCommand } from "./commandParser.js";
import * as lineService from "./lineService.js";

const MAX_LIST_ITEMS_PER_MESSAGE = 10;

type ReminderListItem = Pick<Reminder, "id" | "remindAt" | "message">;

export function buildCreateSuccessMessage(reminder: ReminderListItem): string {
  return `已建立提醒 #${reminder.id}，將於 ${formatDateTime(reminder.remindAt)} 提醒您：${reminder.message}\n可輸入「查詢提醒」查看，或「取消提醒 ${reminder.id}」取消。`;
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
    const lines = group.map(
      (r) => `#${r.id} | ${formatDateTime(r.remindAt)} | ${r.message}`
    );
    return `${title}\n${lines.join("\n")}`;
  });
}

export function buildCancelNotFoundMessage(id: number): string {
  return `找不到可取消的提醒 #${id}，請先輸入「查詢提醒」確認 ID 是否存在且狀態為待發送。`;
}

export function buildHelpMessage(
  reason?: "invalid_datetime_format" | "missing_message" | "invalid_cancel_id"
): string {
  if (reason === "invalid_datetime_format") {
    return "時間格式錯誤，請用：提醒我 YYYY-MM-DD HH:mm 內容\n例如：提醒我 2026-06-20 09:30 開會";
  }
  if (reason === "missing_message") {
    return "請補上提醒內容。\n例如：提醒我 10分鐘後 喝水";
  }
  if (reason === "invalid_cancel_id") {
    return "取消提醒的 ID 必須是數字。\n例如：取消提醒 12";
  }
  return HELP_MESSAGE;
}

export async function handleTextMessage(
  text: string,
  context: MessageContext
): Promise<void> {
  const command = parseCommand(text);

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

      const listMessages = buildReminderListMessages(reminders);
      await lineService.replyMessages(context.replyToken, listMessages);
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
        `已取消提醒 #${cancelled.id}。`
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

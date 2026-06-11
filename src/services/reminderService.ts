import * as reminderRepository from "../repositories/reminderRepository.js";
import type { MessageContext } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import { HELP_MESSAGE, parseCommand } from "./commandParser.js";
import * as lineService from "./lineService.js";

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
        `已建立提醒 #${reminder.id}，將於 ${formatDateTime(reminder.remindAt)} 提醒您：${reminder.message}`
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

      const lines = reminders.map(
        (r) =>
          `#${r.id} | ${formatDateTime(r.remindAt)} | ${r.message}`
      );
      await lineService.replyMessage(
        context.replyToken,
        `待發送提醒：\n${lines.join("\n")}`
      );
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
          `找不到可取消的提醒 #${command.id}，請確認 ID 是否正確且狀態為待發送。`
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
      await lineService.replyMessage(context.replyToken, HELP_MESSAGE);
  }
}

import * as conversationSessionRepository from "../repositories/conversationSessionRepository.js";
import * as notificationSettingsRepository from "../repositories/notificationSettingsRepository.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import type { Reminder } from "../types/reminder.js";
import type { MessageContext } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import {
  computeFirstRemindAt,
  formatRecurrenceSchedule,
  type RecurrenceRule,
} from "../utils/recurrence.js";
import { env } from "../config/env.js";
import {
  HELP_MESSAGE,
  isInterruptingCommand,
  parseCommand,
  type ParsedCommand,
} from "./commandParser.js";
import { resolveCommand } from "./commandResolver.js";
import {
  cancelWizard,
  handleWizardPostback,
  handleWizardText,
  startWizard,
  startTimePicker,
} from "./createReminderWizard.js";
import {
  buildReminderListFlex,
  buildReminderListOverflowText,
} from "./flexMessageBuilder.js";
import {
  handleEditTimeRequest,
  handleEditTimeSubmit,
  replyCreateSuccess,
} from "./editReminderTime.js";
import type { LineMessage } from "./lineService.js";
import * as lineService from "./lineService.js";
import {
  buildCancelNotFoundMessage,
  buildCancelSuccessMessage,
  buildCreateSuccessMessage,
  buildPauseRecurringNotFoundMessage,
  buildPauseRecurringSuccessMessage,
  buildResumeRecurringNotFoundMessage,
  buildResumeRecurringSuccessMessage,
  buildSkipNextNotFoundMessage,
  buildSkipNextSuccessMessage,
} from "./reminderMessages.js";

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
  | "isPaused"
  | "skipNextOnce"
>;

function formatListLine(reminder: ReminderListItem): string {
  const schedule = formatRecurrenceSchedule(reminder);
  const statusSuffix = reminder.isPaused
    ? "（已暫停）"
    : reminder.skipNextOnce
      ? "（跳過下次）"
      : "";
  if (schedule) {
    return `#${reminder.id} | ${schedule} | ${reminder.message}（下次：${formatDateTime(reminder.remindAt)}）${statusSuffix}`;
  }
  return `#${reminder.id} | ${formatDateTime(reminder.remindAt)} | ${reminder.message}${statusSuffix}`;
}

export { buildCreateSuccessMessage } from "./reminderMessages.js";

async function handleAmbiguousChoice(
  choice: "once" | "recurring",
  context: MessageContext
): Promise<boolean> {
  const session = await conversationSessionRepository.findActiveSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
  if (!session || session.step !== "confirmAmbiguousIntent") {
    await lineService.replyMessage(
      context.replyToken,
      "確認已過期，請重新輸入提醒內容。"
    );
    return true;
  }

  const draft = session.draft;
  const message = draft.ambiguousMessage?.trim();
  if (!message) {
    await conversationSessionRepository.deleteSession(
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await lineService.replyMessage(
      context.replyToken,
      "確認資料遺失，請重新輸入提醒內容。"
    );
    return true;
  }

  if (choice === "once") {
    if (!draft.ambiguousOnceRemindAt) {
      await lineService.replyMessage(
        context.replyToken,
        "這則提醒目前無法建立一次性時間，請改用「下週一 09:00 提醒我 ...」格式。"
      );
      return true;
    }
    const remindAt = new Date(draft.ambiguousOnceRemindAt);
    if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) {
      await lineService.replyMessage(
        context.replyToken,
        "一次性提醒時間無效或已過期，請重新輸入提醒內容。"
      );
      await conversationSessionRepository.deleteSession(
        context.sourceType,
        context.sourceId,
        context.userId
      );
      return true;
    }
    const reminder = await reminderRepository.createReminder({
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      userId: context.userId,
      message,
      remindAt,
    });
    await conversationSessionRepository.deleteSession(
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await replyCreateSuccess(context.replyToken, reminder);
    return true;
  }

  const recurrenceType = draft.ambiguousRecurrenceType;
  const recurrenceTime = draft.ambiguousRecurrenceTime;
  if (!recurrenceType || !recurrenceTime) {
    await lineService.replyMessage(
      context.replyToken,
      "這則提醒目前無法直接建立重複提醒，請改寫成例如「每週一 09:00 提醒我 ...」。"
    );
    return true;
  }

  const rule: RecurrenceRule = {
    recurrenceType,
    time: recurrenceTime,
    weekday: draft.ambiguousRecurrenceWeekday,
    dayOfMonth: draft.ambiguousRecurrenceDayOfMonth,
  };
  const remindAt = computeFirstRemindAt(new Date(), rule);
  const reminder = await reminderRepository.createReminder({
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    userId: context.userId,
    message,
    remindAt,
    recurrenceType,
    recurrenceTime,
    recurrenceWeekday: draft.ambiguousRecurrenceWeekday ?? null,
    recurrenceDayOfMonth: draft.ambiguousRecurrenceDayOfMonth ?? null,
  });
  await conversationSessionRepository.deleteSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
  await replyCreateSuccess(context.replyToken, reminder);
  return true;
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

export function buildHelpMessage(
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
    | "create_failed"
): string {
  if (reason === "create_failed") {
    return "建立提醒失敗";
  }
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
  if (reason === "ambiguous_recurrence") {
    return "我不確定你是要一次性還是重複提醒。\n請改寫成其中一種：\n1) 一次性：下週一 09:00 提醒我 測試\n2) 重複：每週一 09:00 提醒我 測試";
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

      await replyCreateSuccess(context.replyToken, reminder);
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

      await replyCreateSuccess(context.replyToken, reminder);
      return;
    }

    case "collectTimeForCreate": {
      await startTimePicker(context, {
        kind: "once",
        remindAt: command.remindDate,
        message: command.message,
      });
      return;
    }

    case "collectTimeForRecurring": {
      await startTimePicker(context, {
        kind: "recurring",
        recurrenceType: command.recurrenceType,
        weekday: command.weekday,
        dayOfMonth: command.dayOfMonth,
        message: command.message,
      });
      return;
    }

    case "confirmAmbiguousCreate": {
      const quickReplyItems: NonNullable<
        NonNullable<LineMessage["quickReply"]>["items"]
      > = [];

      if (command.onceRemindAt) {
        quickReplyItems.push({
          type: "action",
          action: {
            type: "postback",
            label: "一次性",
            data: "action=confirm_ambiguous&value=once",
            displayText: "一次性提醒",
          },
        });
      }
      if (command.recurringOption) {
        quickReplyItems.push({
          type: "action",
          action: {
            type: "postback",
            label: "重複",
            data: "action=confirm_ambiguous&value=recurring",
            displayText: "重複提醒",
          },
        });
      }

      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "confirmAmbiguousIntent",
        {
          ambiguousMessage: command.message,
          ambiguousOnceRemindAt: command.onceRemindAt?.toISOString(),
          ambiguousRecurrenceType: command.recurringOption?.recurrenceType,
          ambiguousRecurrenceTime: command.recurringOption?.time,
          ambiguousRecurrenceWeekday: command.recurringOption?.weekday,
          ambiguousRecurrenceDayOfMonth: command.recurringOption?.dayOfMonth,
        }
      );

      if (quickReplyItems.length === 0) {
        await lineService.replyMessage(
          context.replyToken,
          buildHelpMessage("ambiguous_recurrence")
        );
        return;
      }

      await lineService.replyMessages(context.replyToken, [
        {
          type: "text",
          text: "我不確定你要一次性還是重複提醒，請直接點選：",
          quickReply: { items: quickReplyItems },
        },
      ]);
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

    case "enableNotifications": {
      await notificationSettingsRepository.setNotificationsEnabled(
        context.sourceType,
        context.sourceId,
        context.userId,
        true
      );
      await lineService.replyMessage(context.replyToken, "已開啟提醒通知。");
      return;
    }

    case "disableNotifications": {
      await notificationSettingsRepository.setNotificationsEnabled(
        context.sourceType,
        context.sourceId,
        context.userId,
        false
      );
      await lineService.replyMessage(
        context.replyToken,
        "已關閉提醒通知，現有不會再收到 push（提醒仍保留，開啟後一次性到期項目會補發）。"
      );
      return;
    }

    case "startCreateWizard": {
      await startWizard(context);
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

async function clearWizardSession(context: MessageContext): Promise<void> {
  await conversationSessionRepository.deleteSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
}

export async function handleTextMessage(
  text: string,
  context: MessageContext
): Promise<void> {
  const trimmed = text.trim();
  const session = await conversationSessionRepository.findActiveSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );

  if (session) {
    if (trimmed === "取消") {
      await cancelWizard(context);
      return;
    }

    if (trimmed === "建立提醒") {
      await startWizard(context);
      return;
    }

    if (isInterruptingCommand(trimmed)) {
      await clearWizardSession(context);
      const command = await resolveCommand(trimmed);
      await executeCommand(command, context);
      return;
    }

    const handled = await handleWizardText(trimmed, context);
    if (handled) {
      return;
    }
  }

  const command = await resolveCommand(trimmed);
  await executeCommand(command, context);
}

export async function handlePostback(
  data: string,
  context: MessageContext,
  params: Record<string, string> = {}
): Promise<void> {
  const wizardHandled = await handleWizardPostback(data, params, context);
  if (wizardHandled) {
    return;
  }

  const urlParams = new URLSearchParams(data);
  const action = urlParams.get("action");

  if (action === "confirm_ambiguous") {
    const value = urlParams.get("value");
    if (value === "once" || value === "recurring") {
      await handleAmbiguousChoice(value, context);
      return;
    }
    await lineService.replyMessage(
      context.replyToken,
      "無法識別的確認選項，請重新輸入提醒內容。"
    );
    return;
  }

  await clearWizardSession(context);

  if (action === "help") {
    await lineService.replyMessage(context.replyToken, HELP_MESSAGE);
    return;
  }

  if (action === "cancel") {
    const id = Number(urlParams.get("id"));
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

  if (action === "pause_recurring") {
    const id = Number(urlParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    const paused = await reminderRepository.pauseRecurringReminder(
      id,
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await lineService.replyMessage(
      context.replyToken,
      paused
        ? buildPauseRecurringSuccessMessage(id)
        : buildPauseRecurringNotFoundMessage(id)
    );
    return;
  }

  if (action === "resume_recurring") {
    const id = Number(urlParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    const resumed = await reminderRepository.resumeRecurringReminder(
      id,
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await lineService.replyMessage(
      context.replyToken,
      resumed
        ? buildResumeRecurringSuccessMessage(id)
        : buildResumeRecurringNotFoundMessage(id)
    );
    return;
  }

  if (action === "skip_next") {
    const id = Number(urlParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    const skipped = await reminderRepository.skipNextRecurringReminder(
      id,
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await lineService.replyMessage(
      context.replyToken,
      skipped
        ? buildSkipNextSuccessMessage(id)
        : buildSkipNextNotFoundMessage(id)
    );
    return;
  }

  if (action === "edit_time") {
    const id = Number(urlParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    await handleEditTimeRequest(id, context);
    return;
  }

  if (action === "edit_time_submit") {
    const id = Number(urlParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      await lineService.replyMessage(
        context.replyToken,
        buildHelpMessage("invalid_cancel_id")
      );
      return;
    }
    await handleEditTimeSubmit(id, params, context);
    return;
  }

  await lineService.replyMessage(
    context.replyToken,
    "無法識別的操作，請使用底部選單或輸入「使用說明」。"
  );
}

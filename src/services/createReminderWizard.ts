import type { messagingApi } from "@line/bot-sdk";
import { env } from "../config/env.js";
import * as conversationSessionRepository from "../repositories/conversationSessionRepository.js";
import * as reminderRepository from "../repositories/reminderRepository.js";
import type {
  CreateReminderDraft,
  CreateReminderWizardStep,
  MessageContext,
} from "../types/reminder.js";
import {
  parseAbsoluteDateTime,
  truncateToMinute,
} from "../utils/dateParser.js";
import {
  computeFirstRemindAt,
  parseDayOfMonth,
  parseTime,
  type RecurrenceRule,
} from "../utils/recurrence.js";
import { resolveQuickPickDatetime, replyCreateSuccess } from "./editReminderTime.js";
import * as lineService from "./lineService.js";
import type { LineMessage } from "./lineService.js";

type FlexMessage = messagingApi.FlexMessage;
type QuickReply = messagingApi.QuickReply;

function flexButton(
  label: string,
  data: string,
  displayText?: string
): messagingApi.FlexComponent {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    action: {
      type: "postback",
      label,
      data,
      displayText: displayText ?? label,
    },
  };
}

function datetimeButton(
  label: string,
  data: string,
  mode: "datetime" | "time",
  initial: string
): messagingApi.FlexComponent {
  return {
    type: "button",
    style: "primary",
    height: "sm",
    action: {
      type: "datetimepicker",
      label,
      data,
      mode,
      initial,
    },
  };
}

function buildKindFlex(): FlexMessage {
  return {
    type: "flex",
    altText: "請選擇提醒類型",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "建立提醒",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "請選擇提醒類型",
            size: "sm",
            color: "#666666",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          flexButton("一次性提醒", "wizard=kind&value=once"),
          flexButton("重複提醒", "wizard=kind&value=recurring"),
        ],
      },
    },
  };
}

function buildRecurrenceFlex(): FlexMessage {
  return {
    type: "flex",
    altText: "請選擇重複頻率",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "重複提醒",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "請選擇重複頻率",
            size: "sm",
            color: "#666666",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          flexButton("每天", "wizard=recurrence&value=daily"),
          flexButton("每週", "wizard=recurrence&value=weekly"),
          flexButton("每月", "wizard=recurrence&value=monthly"),
        ],
      },
    },
  };
}

function buildDatetimeFlex(): FlexMessage {
  const initial = new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(" ", "T");

  return {
    type: "flex",
    altText: "請選擇提醒時間",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "一次性提醒",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "請點擊下方按鈕選擇日期與時間",
            size: "sm",
            color: "#666666",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          datetimeButton("選擇日期時間", "wizard=datetime", "datetime", initial),
        ],
      },
    },
  };
}

function buildTimeFlex(): FlexMessage {
  const initial = new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  return {
    type: "flex",
    altText: "請選擇提醒時間",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "提醒時間",
            weight: "bold",
            size: "lg",
          },
          {
            type: "text",
            text: "請點擊下方按鈕選擇時間",
            size: "sm",
            color: "#666666",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          datetimeButton("選擇時間", "wizard=time", "time", initial),
        ],
      },
    },
  };
}

function datetimeQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action",
        action: {
          type: "postback",
          label: "30分鐘後",
          data: "wizard=quick&value=30m",
          displayText: "30分鐘後",
        },
      },
      {
        type: "action",
        action: {
          type: "postback",
          label: "1小時後",
          data: "wizard=quick&value=1h",
          displayText: "1小時後",
        },
      },
      {
        type: "action",
        action: {
          type: "postback",
          label: "明天 09:00",
          data: "wizard=quick&value=tomorrow9",
          displayText: "明天 09:00",
        },
      },
    ],
  };
}

function weekdayQuickReply(): QuickReply {
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return {
    items: labels.map((label, index) => ({
      type: "action",
      action: {
        type: "postback",
        label: `週${label}`,
        data: `wizard=weekday&value=${index + 1}`,
        displayText: `週${label}`,
      },
    })),
  };
}

function dayOfMonthQuickReply(page: number): QuickReply {
  const start = page * 10 + 1;
  const end = Math.min(start + 9, 31);
  const items: QuickReply["items"] = [];
  for (let day = start; day <= end; day += 1) {
    items.push({
      type: "action",
      action: {
        type: "postback",
        label: `${day} 日`,
        data: `wizard=day&value=${day}`,
        displayText: `${day} 日`,
      },
    });
  }
  if (end < 31) {
    items.push({
      type: "action",
      action: {
        type: "postback",
        label: "下一頁",
        data: `wizard=day_page&value=${page + 1}`,
        displayText: "下一頁",
      },
    });
  }
  if (page > 0) {
    items.unshift({
      type: "action",
      action: {
        type: "postback",
        label: "上一頁",
        data: `wizard=day_page&value=${page - 1}`,
        displayText: "上一頁",
      },
    });
  }
  return { items };
}

async function replyStep(
  replyToken: string,
  step: CreateReminderWizardStep,
  page = 0
): Promise<void> {
  switch (step) {
    case "chooseKind":
      await lineService.replyMessages(replyToken, [buildKindFlex()]);
      return;
    case "chooseRecurrence":
      await lineService.replyMessages(replyToken, [buildRecurrenceFlex()]);
      return;
    case "pickDatetime":
      await lineService.replyMessages(replyToken, [
        buildDatetimeFlex(),
        {
          type: "text",
          text: "或選擇快捷時間：",
          quickReply: datetimeQuickReply(),
        },
      ]);
      return;
    case "pickTime":
      await lineService.replyMessages(replyToken, [buildTimeFlex()]);
      return;
    case "pickWeekday":
      await lineService.replyMessages(replyToken, [
        {
          type: "text",
          text: "請選擇每週星期幾：",
          quickReply: weekdayQuickReply(),
        },
      ]);
      return;
    case "pickDayOfMonth":
      await lineService.replyMessages(replyToken, [
        {
          type: "text",
          text: `請選擇每月幾號（第 ${page + 1} 頁）：`,
          quickReply: dayOfMonthQuickReply(page),
        },
      ]);
      return;
    case "enterMessage":
      await lineService.replyMessage(
        replyToken,
        "請輸入提醒內容（例如：開會、喝水）"
      );
      return;
  }
}

export async function startWizard(context: MessageContext): Promise<void> {
  await conversationSessionRepository.upsertSession(
    context.sourceType,
    context.sourceId,
    context.userId,
    "chooseKind",
    {}
  );
  await replyStep(context.replyToken, "chooseKind");
}

export async function startTimePicker(
  context: MessageContext,
  draft: CreateReminderDraft
): Promise<void> {
  await conversationSessionRepository.upsertSession(
    context.sourceType,
    context.sourceId,
    context.userId,
    "pickTime",
    draft
  );

  const messages: LineMessage[] = [buildTimeFlex()];
  if (draft.kind === "once" && draft.remindAt) {
    messages.push({
      type: "text",
      text: `已解析日期：${draft.remindAt.slice(0, 10)}，請選擇幾點幾分。`,
    });
  } else if (draft.kind === "recurring") {
    messages.push({
      type: "text",
      text: "請選擇重複提醒的時間。",
    });
  }

  await lineService.replyMessages(context.replyToken, messages);
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

async function finalizeWizard(
  context: MessageContext,
  draft: CreateReminderDraft,
  message: string
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) {
    await lineService.replyMessage(
      context.replyToken,
      "提醒內容不可為空，請重新輸入。"
    );
    return;
  }

  if (draft.kind === "once") {
    if (!draft.remindAt) {
      await lineService.replyMessage(context.replyToken, "建立提醒失敗，請重新開始。");
      return;
    }
    const remindAt = parseDatetimePickerValue(draft.remindAt);
    if (!remindAt || remindAt <= new Date()) {
      await lineService.replyMessage(
        context.replyToken,
        "提醒時間必須晚於現在，請重新輸入「建立提醒」。"
      );
      await conversationSessionRepository.deleteSession(
        context.sourceType,
        context.sourceId,
        context.userId
      );
      return;
    }

    const reminder = await reminderRepository.createReminder({
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      userId: context.userId,
      message: trimmed,
      remindAt,
    });
    await conversationSessionRepository.deleteSession(
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await replyCreateSuccess(context.replyToken, reminder);
    return;
  }

  if (draft.kind === "recurring" && draft.recurrenceType && draft.time) {
    const rule: RecurrenceRule = {
      recurrenceType: draft.recurrenceType,
      time: draft.time,
      weekday: draft.weekday,
      dayOfMonth: draft.dayOfMonth,
    };
    const remindAt = computeFirstRemindAt(new Date(), rule);
    if (remindAt <= new Date()) {
      await lineService.replyMessage(
        context.replyToken,
        "提醒時間必須晚於現在，請重新輸入「建立提醒」。"
      );
      await conversationSessionRepository.deleteSession(
        context.sourceType,
        context.sourceId,
        context.userId
      );
      return;
    }

    const reminder = await reminderRepository.createReminder({
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      userId: context.userId,
      message: trimmed,
      remindAt,
      recurrenceType: draft.recurrenceType,
      recurrenceTime: draft.time,
      recurrenceWeekday: draft.weekday ?? null,
      recurrenceDayOfMonth: draft.dayOfMonth ?? null,
    });
    await conversationSessionRepository.deleteSession(
      context.sourceType,
      context.sourceId,
      context.userId
    );
    await replyCreateSuccess(context.replyToken, reminder);
    return;
  }

  await lineService.replyMessage(context.replyToken, "建立提醒失敗，請重新開始。");
  await conversationSessionRepository.deleteSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
}

export async function handleWizardText(
  text: string,
  context: MessageContext
): Promise<boolean> {
  const session = await conversationSessionRepository.findActiveSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
  if (!session) {
    return false;
  }

  if (session.step !== "enterMessage") {
    await lineService.replyMessage(
      context.replyToken,
      "請用上方按鈕或選項完成設定。"
    );
    return true;
  }

  await finalizeWizard(context, session.draft, text);
  return true;
}

export async function handleWizardPostback(
  data: string,
  params: Record<string, string>,
  context: MessageContext
): Promise<boolean> {
  const urlParams = new URLSearchParams(data);
  const wizard = urlParams.get("wizard");
  if (!wizard) {
    return false;
  }

  let session = await conversationSessionRepository.findActiveSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );

  if (!session && wizard === "kind") {
    await conversationSessionRepository.upsertSession(
      context.sourceType,
      context.sourceId,
      context.userId,
      "chooseKind",
      {}
    );
    session = await conversationSessionRepository.findActiveSession(
      context.sourceType,
      context.sourceId,
      context.userId
    );
  }

  if (!session) {
    await lineService.replyMessage(
      context.replyToken,
      "建立提醒流程已過期，請重新輸入「建立提醒」。"
    );
    return true;
  }

  const draft: CreateReminderDraft = { ...session.draft };

  if (wizard === "kind") {
    const value = urlParams.get("value");
    if (value === "once") {
      draft.kind = "once";
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "pickDatetime",
        draft
      );
      await replyStep(context.replyToken, "pickDatetime");
      return true;
    }
    if (value === "recurring") {
      draft.kind = "recurring";
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "chooseRecurrence",
        draft
      );
      await replyStep(context.replyToken, "chooseRecurrence");
      return true;
    }
  }

  if (wizard === "recurrence") {
    const value = urlParams.get("value");
    if (value === "daily" || value === "weekly" || value === "monthly") {
      draft.recurrenceType = value;
      if (value === "weekly") {
        await conversationSessionRepository.upsertSession(
          context.sourceType,
          context.sourceId,
          context.userId,
          "pickWeekday",
          draft
        );
        await replyStep(context.replyToken, "pickWeekday");
        return true;
      }
      if (value === "monthly") {
        await conversationSessionRepository.upsertSession(
          context.sourceType,
          context.sourceId,
          context.userId,
          "pickDayOfMonth",
          draft
        );
        await replyStep(context.replyToken, "pickDayOfMonth", 0);
        return true;
      }
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "pickTime",
        draft
      );
      await replyStep(context.replyToken, "pickTime");
      return true;
    }
  }

  if (wizard === "weekday") {
    const weekday = Number(urlParams.get("value"));
    if (weekday >= 1 && weekday <= 7) {
      draft.weekday = weekday;
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "pickTime",
        draft
      );
      await replyStep(context.replyToken, "pickTime");
      return true;
    }
  }

  if (wizard === "day") {
    const day = Number(urlParams.get("value"));
    const dayOfMonth = parseDayOfMonth(String(day));
    if (dayOfMonth) {
      draft.dayOfMonth = dayOfMonth;
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "pickTime",
        draft
      );
      await replyStep(context.replyToken, "pickTime");
      return true;
    }
  }

  if (wizard === "day_page") {
    const page = Number(urlParams.get("value"));
    if (Number.isInteger(page) && page >= 0) {
      await conversationSessionRepository.upsertSession(
        context.sourceType,
        context.sourceId,
        context.userId,
        "pickDayOfMonth",
        draft
      );
      await replyStep(context.replyToken, "pickDayOfMonth", page);
      return true;
    }
  }

  if (wizard === "datetime" && params.datetime) {
    draft.remindAt = params.datetime;
    await conversationSessionRepository.upsertSession(
      context.sourceType,
      context.sourceId,
      context.userId,
      "enterMessage",
      draft
    );
    await replyStep(context.replyToken, "enterMessage");
    return true;
  }

  if (wizard === "quick") {
    const value = urlParams.get("value");
    if (!value || session.step !== "pickDatetime") {
      await lineService.replyMessage(
        context.replyToken,
        "無法識別的選項，請重新輸入「建立提醒」。"
      );
      return true;
    }
    const datetime = resolveQuickPickDatetime(value);
    if (!datetime) {
      await lineService.replyMessage(
        context.replyToken,
        "快捷時間設定失敗，請重新選擇。"
      );
      return true;
    }
    draft.remindAt = datetime;
    await conversationSessionRepository.upsertSession(
      context.sourceType,
      context.sourceId,
      context.userId,
      "enterMessage",
      draft
    );
    await replyStep(context.replyToken, "enterMessage");
    return true;
  }

  if (wizard === "time" && params.time) {
    const time = parseTimePickerValue(params.time);
    if (!time) {
      await lineService.replyMessage(
        context.replyToken,
        "時間格式錯誤，請重新選擇。"
      );
      return true;
    }
    draft.time = time;

    if (draft.kind === "once" && draft.remindAt) {
      draft.remindAt = `${draft.remindAt.slice(0, 10)}T${time}`;
    }

    if (draft.message) {
      await finalizeWizard(context, draft, draft.message);
      return true;
    }

    await conversationSessionRepository.upsertSession(
      context.sourceType,
      context.sourceId,
      context.userId,
      "enterMessage",
      draft
    );
    await replyStep(context.replyToken, "enterMessage");
    return true;
  }

  await lineService.replyMessage(
    context.replyToken,
    "無法識別的選項，請重新輸入「建立提醒」。"
  );
  return true;
}

export async function cancelWizard(context: MessageContext): Promise<void> {
  await conversationSessionRepository.deleteSession(
    context.sourceType,
    context.sourceId,
    context.userId
  );
  await lineService.replyMessage(context.replyToken, "已取消建立提醒。");
}

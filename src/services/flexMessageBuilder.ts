import type { messagingApi } from "@line/bot-sdk";
import type { RecurrenceType } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import {
  formatRecurrenceSchedule,
  formatRecurrenceTypeLabel,
} from "../utils/recurrence.js";

type FlexMessage = messagingApi.FlexMessage;
type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export const FLEX_CAROUSEL_LIMIT = 12;

export interface ReminderFlexItem {
  id: number;
  remindAt: Date;
  message: string;
  recurrenceType: RecurrenceType;
  recurrenceTime: string | null;
  recurrenceWeekday: number | null;
  recurrenceDayOfMonth: number | null;
  isPaused: boolean;
  skipNextOnce: boolean;
}

function postbackButton(
  label: string,
  data: string,
  displayText: string
): FlexComponent {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    action: {
      type: "postback",
      label,
      data,
      displayText,
    },
  };
}

function buildFooterButtons(reminder: ReminderFlexItem): FlexComponent[] {
  const buttons: FlexComponent[] = [
    postbackButton(
      "修改時間",
      `action=edit_time&id=${reminder.id}`,
      `修改提醒 ${reminder.id} 時間`
    ),
    postbackButton(
      "取消提醒",
      `action=cancel&id=${reminder.id}`,
      `取消提醒 ${reminder.id}`
    ),
  ];

  if (reminder.recurrenceType !== "none") {
    if (reminder.isPaused) {
      buttons.push(
        postbackButton(
          "恢復重複",
          `action=resume_recurring&id=${reminder.id}`,
          `恢復重複 ${reminder.id}`
        )
      );
    } else {
      buttons.push(
        postbackButton(
          "暫停重複",
          `action=pause_recurring&id=${reminder.id}`,
          `暫停重複 ${reminder.id}`
        ),
        postbackButton(
          "跳過下次",
          `action=skip_next&id=${reminder.id}`,
          `跳過下次 ${reminder.id}`
        )
      );
    }
  }

  return buttons;
}

function buildBubble(reminder: ReminderFlexItem): FlexBubble {
  const schedule = formatRecurrenceSchedule(reminder);
  const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
  const subtitle = schedule
    ? `${typeLabel} ${schedule}`
    : formatDateTime(reminder.remindAt);

  const statusLines: string[] = [];
  if (schedule) {
    statusLines.push(`下次：${formatDateTime(reminder.remindAt)}`);
  } else {
    statusLines.push("一次性提醒");
  }
  if (reminder.isPaused) {
    statusLines.push("（已暫停重複）");
  } else if (reminder.skipNextOnce) {
    statusLines.push("（將跳過下次）");
  }

  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: `#${reminder.id}`,
          size: "xs",
          color: "#aaaaaa",
        },
        {
          type: "text",
          text: reminder.message,
          weight: "bold",
          size: "lg",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "sm",
          color: "#666666",
          wrap: true,
        },
        {
          type: "text",
          text: statusLines.join(" "),
          size: "xs",
          color: "#888888",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buildFooterButtons(reminder),
    },
  };
}

export function buildReminderListFlex(
  reminders: ReminderFlexItem[]
): FlexMessage | null {
  if (reminders.length === 0) {
    return null;
  }

  const bubbles = reminders.slice(0, FLEX_CAROUSEL_LIMIT).map(buildBubble);
  const contents =
    bubbles.length === 1
      ? bubbles[0]
      : { type: "carousel" as const, contents: bubbles };

  return {
    type: "flex",
    altText: `待發送提醒 ${reminders.length} 筆`,
    contents,
  };
}

export function buildReminderFlex(
  reminder: ReminderFlexItem
): FlexMessage {
  return {
    type: "flex",
    altText: `提醒 #${reminder.id}：${reminder.message}`,
    contents: buildBubble(reminder),
  };
}

export function buildReminderListOverflowText(total: number): string | null {
  if (total <= FLEX_CAROUSEL_LIMIT) {
    return null;
  }
  return `共有 ${total} 筆提醒，卡片僅顯示前 ${FLEX_CAROUSEL_LIMIT} 筆。`;
}

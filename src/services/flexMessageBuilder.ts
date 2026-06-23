import type { messagingApi } from "@line/bot-sdk";
import { formatDateTime } from "../utils/dateParser.js";
import {
  formatRecurrenceSchedule,
  formatRecurrenceTypeLabel,
} from "../utils/recurrence.js";

type FlexMessage = messagingApi.FlexMessage;
type FlexBubble = messagingApi.FlexBubble;

export const FLEX_CAROUSEL_LIMIT = 12;

export interface ReminderFlexItem {
  id: number;
  remindAt: Date;
  message: string;
  recurrenceType: string;
  recurrenceTime: string | null;
  recurrenceWeekday: number | null;
  recurrenceDayOfMonth: number | null;
}

function buildBubble(reminder: ReminderFlexItem): FlexBubble {
  const schedule = formatRecurrenceSchedule(reminder);
  const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
  const subtitle = schedule
    ? `${typeLabel} ${schedule}`
    : formatDateTime(reminder.remindAt);

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
          text: schedule
            ? `下次：${formatDateTime(reminder.remindAt)}`
            : "一次性提醒",
          size: "xs",
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
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "取消提醒",
            data: `action=cancel&id=${reminder.id}`,
            displayText: `取消提醒 ${reminder.id}`,
          },
        },
      ],
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

export function buildReminderListOverflowText(total: number): string | null {
  if (total <= FLEX_CAROUSEL_LIMIT) {
    return null;
  }
  return `共有 ${total} 筆提醒，卡片僅顯示前 ${FLEX_CAROUSEL_LIMIT} 筆。`;
}

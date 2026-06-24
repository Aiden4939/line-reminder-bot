import type { Reminder } from "../types/reminder.js";
import { formatDateTime } from "../utils/dateParser.js";
import {
  formatRecurrenceSchedule,
  formatRecurrenceTypeLabel,
} from "../utils/recurrence.js";

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

export function buildCreateSuccessMessage(reminder: ReminderListItem): string {
  const schedule = formatRecurrenceSchedule(reminder);
  if (schedule) {
    const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
    return `已建立${typeLabel}提醒 #${reminder.id}，首次於 ${formatDateTime(reminder.remindAt)}，之後${schedule} 重複：${reminder.message}\n下方卡片可修改時間或取消。`;
  }
  return `已建立提醒 #${reminder.id}，將於 ${formatDateTime(reminder.remindAt)} 提醒您：${reminder.message}\n下方卡片可修改時間或取消。`;
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

export function buildPauseRecurringSuccessMessage(id: number): string {
  return `已暫停重複提醒 #${id}，恢復前不會再收到通知。`;
}

export function buildResumeRecurringSuccessMessage(id: number): string {
  return `已恢復重複提醒 #${id}。`;
}

export function buildSkipNextSuccessMessage(id: number): string {
  return `已設定跳過重複提醒 #${id} 的下次通知。`;
}

export function buildPauseRecurringNotFoundMessage(id: number): string {
  return `找不到可暫停的重複提醒 #${id}。`;
}

export function buildResumeRecurringNotFoundMessage(id: number): string {
  return `找不到可恢復的重複提醒 #${id}。`;
}

export function buildSkipNextNotFoundMessage(id: number): string {
  return `找不到可跳過的重複提醒 #${id}。`;
}

export function buildEditTimeNotFoundMessage(id: number): string {
  return `找不到可修改的提醒 #${id}，請先輸入「查詢提醒」確認 ID 是否存在且狀態為待發送。`;
}

export function buildEditTimePastMessage(): string {
  return "提醒時間必須晚於現在，請重新選擇。";
}

export function buildEditTimeSuccessMessage(reminder: ReminderListItem): string {
  const schedule = formatRecurrenceSchedule(reminder);
  if (schedule) {
    const typeLabel = formatRecurrenceTypeLabel(reminder.recurrenceType);
    return `已更新${typeLabel}提醒 #${reminder.id} 的時間，下次於 ${formatDateTime(reminder.remindAt)}，之後${schedule} 重複。`;
  }
  return `已更新提醒 #${reminder.id} 的時間，將於 ${formatDateTime(reminder.remindAt)} 提醒您。`;
}

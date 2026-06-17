import { env } from "../config/env.js";
import type { RecurrenceType, Reminder } from "../types/reminder.js";
import { parseAbsoluteDateTime, truncateToMinute } from "./dateParser.js";

export type ActiveRecurrenceType = "daily" | "weekly" | "monthly";

export interface RecurrenceRule {
  recurrenceType: ActiveRecurrenceType;
  time: string;
  weekday?: number;
  dayOfMonth?: number;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const WEEKDAY_LABELS = ["", "一", "二", "三", "四", "五", "六", "日"];

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

function getDatePartsInTz(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 1,
  };
}

function buildDateTime(
  year: number,
  month: number,
  day: number,
  time: string
): Date {
  const dateTimeStr = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${time}`;
  const result = parseAbsoluteDateTime(dateTimeStr);
  if (!result) {
    throw new Error(`Invalid date: ${dateTimeStr}`);
  }
  return result;
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getValidDayInMonth(
  year: number,
  month: number,
  targetDay: number
): number {
  return Math.min(targetDay, getLastDayOfMonth(year, month));
}

function addDays(
  year: number,
  month: number,
  day: number,
  days: number
): DateParts {
  const base = buildDateTime(year, month, day, "12:00");
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return getDatePartsInTz(next);
}

function addMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

export function parseTime(time: string): string | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

export function parseWeekday(text: string): number | null {
  return WEEKDAY_MAP[text] ?? null;
}

export function parseDayOfMonth(text: string): number | null {
  const day = Number(text);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  return day;
}

function computeFirstDaily(now: Date, time: string): Date {
  const parts = getDatePartsInTz(now);
  let candidate = buildDateTime(parts.year, parts.month, parts.day, time);
  if (candidate <= now) {
    const next = addDays(parts.year, parts.month, parts.day, 1);
    candidate = buildDateTime(next.year, next.month, next.day, time);
  }
  return candidate;
}

function computeFirstWeekly(now: Date, time: string, weekday: number): Date {
  const parts = getDatePartsInTz(now);
  const daysUntil = (weekday - parts.weekday + 7) % 7;
  let target = addDays(parts.year, parts.month, parts.day, daysUntil);
  let candidate = buildDateTime(target.year, target.month, target.day, time);
  if (candidate <= now) {
    target = addDays(target.year, target.month, target.day, 7);
    candidate = buildDateTime(target.year, target.month, target.day, time);
  }
  return candidate;
}

function computeFirstMonthly(
  now: Date,
  time: string,
  dayOfMonth: number
): Date {
  const parts = getDatePartsInTz(now);
  const day = getValidDayInMonth(parts.year, parts.month, dayOfMonth);
  let candidate = buildDateTime(parts.year, parts.month, day, time);
  if (candidate <= now) {
    const nextMonth = addMonths(parts.year, parts.month, 1);
    const nextDay = getValidDayInMonth(
      nextMonth.year,
      nextMonth.month,
      dayOfMonth
    );
    candidate = buildDateTime(nextMonth.year, nextMonth.month, nextDay, time);
  }
  return candidate;
}

export function computeFirstRemindAt(now: Date, rule: RecurrenceRule): Date {
  const truncatedNow = truncateToMinute(now);
  if (rule.recurrenceType === "daily") {
    return computeFirstDaily(truncatedNow, rule.time);
  }
  if (rule.recurrenceType === "weekly") {
    return computeFirstWeekly(truncatedNow, rule.time, rule.weekday!);
  }
  return computeFirstMonthly(truncatedNow, rule.time, rule.dayOfMonth!);
}

export function computeNextRemindAt(
  currentRemindAt: Date,
  rule: RecurrenceRule
): Date {
  const parts = getDatePartsInTz(currentRemindAt);
  if (rule.recurrenceType === "daily") {
    const next = addDays(parts.year, parts.month, parts.day, 1);
    return buildDateTime(next.year, next.month, next.day, rule.time);
  }
  if (rule.recurrenceType === "weekly") {
    const next = addDays(parts.year, parts.month, parts.day, 7);
    return buildDateTime(next.year, next.month, next.day, rule.time);
  }
  const nextMonth = addMonths(parts.year, parts.month, 1);
  const day = getValidDayInMonth(
    nextMonth.year,
    nextMonth.month,
    rule.dayOfMonth!
  );
  return buildDateTime(nextMonth.year, nextMonth.month, day, rule.time);
}

export function toRecurrenceRule(
  reminder: Pick<
    Reminder,
    | "recurrenceType"
    | "recurrenceTime"
    | "recurrenceWeekday"
    | "recurrenceDayOfMonth"
  >
): RecurrenceRule | null {
  if (reminder.recurrenceType === "none" || !reminder.recurrenceTime) {
    return null;
  }
  if (reminder.recurrenceType === "weekly") {
    if (!reminder.recurrenceWeekday) {
      return null;
    }
    return {
      recurrenceType: "weekly",
      time: reminder.recurrenceTime,
      weekday: reminder.recurrenceWeekday,
    };
  }
  if (reminder.recurrenceType === "monthly") {
    if (!reminder.recurrenceDayOfMonth) {
      return null;
    }
    return {
      recurrenceType: "monthly",
      time: reminder.recurrenceTime,
      dayOfMonth: reminder.recurrenceDayOfMonth,
    };
  }
  return {
    recurrenceType: "daily",
    time: reminder.recurrenceTime,
  };
}

export function formatRecurrenceSchedule(
  reminder: Pick<
    Reminder,
    | "recurrenceType"
    | "recurrenceTime"
    | "recurrenceWeekday"
    | "recurrenceDayOfMonth"
  >
): string | null {
  if (reminder.recurrenceType === "none" || !reminder.recurrenceTime) {
    return null;
  }
  if (reminder.recurrenceType === "daily") {
    return `每天 ${reminder.recurrenceTime}`;
  }
  if (reminder.recurrenceType === "weekly" && reminder.recurrenceWeekday) {
    return `每週${WEEKDAY_LABELS[reminder.recurrenceWeekday]} ${reminder.recurrenceTime}`;
  }
  if (reminder.recurrenceType === "monthly" && reminder.recurrenceDayOfMonth) {
    return `每月${reminder.recurrenceDayOfMonth}日 ${reminder.recurrenceTime}`;
  }
  return null;
}

export function formatRecurrenceTypeLabel(type: RecurrenceType): string | null {
  if (type === "daily") {
    return "每日";
  }
  if (type === "weekly") {
    return "每週";
  }
  if (type === "monthly") {
    return "每月";
  }
  return null;
}

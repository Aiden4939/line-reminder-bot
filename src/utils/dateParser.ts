import { env } from "../config/env.js";

function getTimezoneOffset(date: Date, timeZone: string): string {
  const formatted = date.toLocaleString("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const match = formatted.match(/GMT([+-]\d+(?::\d{2})?)/);
  if (!match) {
    return "+00:00";
  }
  const raw = match[1];
  if (raw.includes(":")) {
    const [signAndHour, minute] = raw.split(":");
    const sign = signAndHour.startsWith("-") ? "-" : "+";
    const hour = Math.abs(Number(signAndHour)).toString().padStart(2, "0");
    return `${sign}${hour}:${minute}`;
  }
  const sign = raw.startsWith("-") ? "-" : "+";
  const hour = Math.abs(Number(raw)).toString().padStart(2, "0");
  return `${sign}${hour}:00`;
}

function isValidClock(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  return `${String(year).padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)} ${padDatePart(hour)}:${padDatePart(minute)}`;
}

/** Intl 偶發 hour=24；正規化為次日 00:xx，其餘非法時鐘回 null */
function normalizeClockParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (!Number.isInteger(hour) || hour < 0) {
    return null;
  }

  if (hour === 24) {
    const dayStart = parseAbsoluteDateTime(
      `${String(year).padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)} 00:00`
    );
    if (!dayStart) {
      return null;
    }
    const nextDay = addMinutes(dayStart, 24 * 60 + minute);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: env.tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(nextDay);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
    };
  }

  if (hour > 24 || !isValidClock(hour, minute)) {
    return null;
  }

  return { year, month, day, hour, minute };
}

export function parseAbsoluteDateTime(dateTimeStr: string): Date | null {
  const match = dateTimeStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[2].slice(0, 2));
  const minute = Number(match[2].slice(3, 5));
  if (!isValidClock(hour, minute)) {
    return null;
  }

  const isoLocal = `${match[1]}T${match[2]}:00`;
  const probe = new Date(`${isoLocal}Z`);
  const offset = getTimezoneOffset(probe, env.tz);
  const date = new Date(`${isoLocal}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** 將時間截斷至分鐘（秒與毫秒歸零），與排程每分鐘檢查對齊 */
export function truncateToMinute(date: Date): Date | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const normalized = normalizeClockParts(
    Number(get("year")),
    Number(get("month")),
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute"))
  );
  if (!normalized) {
    return null;
  }

  return parseAbsoluteDateTime(formatDateTimeParts(
    normalized.year,
    normalized.month,
    normalized.day,
    normalized.hour,
    normalized.minute
  ));
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: env.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

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

export function parseAbsoluteDateTime(dateTimeStr: string): Date | null {
  const match = dateTimeStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (!match) {
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

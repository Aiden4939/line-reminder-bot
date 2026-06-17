export type SourceType = "user" | "group" | "room";

export type ReminderStatus =
  | "pending"
  | "processing"
  | "sent"
  | "cancelled"
  | "failed";

export type RecurrenceType = "none" | "daily" | "weekly" | "monthly";

export interface Reminder {
  id: number;
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  message: string;
  remindAt: Date;
  recurrenceType: RecurrenceType;
  recurrenceTime: string | null;
  recurrenceWeekday: number | null;
  recurrenceDayOfMonth: number | null;
  status: ReminderStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReminderInput {
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  message: string;
  remindAt: Date;
  recurrenceType?: RecurrenceType;
  recurrenceTime?: string | null;
  recurrenceWeekday?: number | null;
  recurrenceDayOfMonth?: number | null;
}

export interface MessageContext {
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  replyToken: string;
}

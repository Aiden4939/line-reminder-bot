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
  isPaused: boolean;
  skipNextOnce: boolean;
  status: ReminderStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateReminderWizardStep =
  | "chooseKind"
  | "chooseRecurrence"
  | "pickWeekday"
  | "pickDayOfMonth"
  | "pickDatetime"
  | "pickTime"
  | "enterMessage"
  | "confirmAmbiguousIntent";

export interface CreateReminderDraft {
  kind?: "once" | "recurring";
  recurrenceType?: "daily" | "weekly" | "monthly";
  weekday?: number;
  dayOfMonth?: number;
  remindAt?: string;
  time?: string;
  ambiguousMessage?: string;
  ambiguousOnceRemindAt?: string;
  ambiguousRecurrenceType?: "daily" | "weekly" | "monthly";
  ambiguousRecurrenceTime?: string;
  ambiguousRecurrenceWeekday?: number;
  ambiguousRecurrenceDayOfMonth?: number;
}

export interface ConversationSession {
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  flow: "create_reminder";
  step: CreateReminderWizardStep;
  draft: CreateReminderDraft;
  expiresAt: Date;
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

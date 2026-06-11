export type SourceType = "user" | "group" | "room";

export type ReminderStatus =
  | "pending"
  | "processing"
  | "sent"
  | "cancelled"
  | "failed";

export interface Reminder {
  id: number;
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  message: string;
  remindAt: Date;
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
}

export interface MessageContext {
  sourceType: SourceType;
  sourceId: string;
  userId: string;
  replyToken: string;
}

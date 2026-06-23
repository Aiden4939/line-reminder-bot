import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[env] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 3000),
  tz: process.env.TZ || "Asia/Taipei",
  lineChannelSecret: requireEnv("LINE_CHANNEL_SECRET"),
  lineChannelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
  nluMode: (process.env.NLU_MODE || "hybrid") as "rules" | "hybrid",
  flexListEnabled: process.env.FLEX_LIST_ENABLED !== "false",
  db: {
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 5432),
    database: requireEnv("DB_NAME"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
  },
  reminderCron: process.env.REMINDER_CRON || "* * * * *",
};

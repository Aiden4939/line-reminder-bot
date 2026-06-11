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
  db: {
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 5432),
    database: requireEnv("DB_NAME"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
  },
  reminderCron: process.env.REMINDER_CRON || "* * * * *",
};

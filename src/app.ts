import express from "express";
import { healthRouter } from "./routes/health.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";

export function createApp(): express.Application {
  const app = express();

  app.use("/health", healthRouter);
  app.use(
    "/webhook/line",
    express.raw({ type: "*/*" }),
    lineWebhookRouter
  );

  return app;
}

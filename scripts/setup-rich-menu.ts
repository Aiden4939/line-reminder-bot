import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { messagingApi } from "@line/bot-sdk";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: env.lineChannelAccessToken,
});

const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: env.lineChannelAccessToken,
});

const MENU_WIDTH = 2500;
const MENU_HEIGHT = 843;
const COL_WIDTH = Math.floor(MENU_WIDTH / 4);

async function main(): Promise<void> {
  const richMenu: messagingApi.RichMenuRequest = {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: "line-reminder-bot-menu",
    chatBarText: "提醒選單",
    areas: [
      {
        bounds: { x: 0, y: 0, width: COL_WIDTH, height: MENU_HEIGHT },
        action: {
          type: "message",
          label: "建立提醒",
          text: "建立提醒",
        },
      },
      {
        bounds: { x: COL_WIDTH, y: 0, width: COL_WIDTH, height: MENU_HEIGHT },
        action: {
          type: "message",
          label: "查詢提醒",
          text: "查詢提醒",
        },
      },
      {
        bounds: {
          x: COL_WIDTH * 2,
          y: 0,
          width: COL_WIDTH,
          height: MENU_HEIGHT,
        },
        action: {
          type: "message",
          label: "使用說明",
          text: "使用說明",
        },
      },
      {
        bounds: {
          x: COL_WIDTH * 3,
          y: 0,
          width: MENU_WIDTH - COL_WIDTH * 3,
          height: MENU_HEIGHT,
        },
        action: {
          type: "postback",
          label: "指令範例",
          data: "action=help",
          displayText: "指令範例",
        },
      },
    ],
  };

  const { richMenuId } = await client.createRichMenu(richMenu);

  const imagePath = path.join(projectRoot, "assets", "rich-menu.png");
  if (existsSync(imagePath)) {
    await blobClient.setRichMenuImage(
      richMenuId,
      createReadStream(imagePath),
      "image/png"
    );
    console.log(`[rich-menu] Uploaded image: ${imagePath}`);
  } else {
    console.warn(
      `[rich-menu] 未找到 ${imagePath}，請至 LINE Official Account Manager 上傳 2500x843 選單圖`
    );
  }

  await client.setDefaultRichMenu(richMenuId);

  console.log(`[rich-menu] Created and set default rich menu: ${richMenuId}`);
  console.log(
    "[rich-menu] Areas: 建立提醒 | 查詢提醒 | 使用說明 | 指令範例(postback)"
  );
}

main().catch((error) => {
  console.error("[rich-menu] Failed:", error);
  process.exit(1);
});

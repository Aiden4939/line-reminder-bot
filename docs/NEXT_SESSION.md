# 下次對話接手指南（NEXT_SESSION）

> **用途：** 換裝置、新開 Cursor 對話時先讀本檔。  
> **最後更新：** 2026-06-24  
> **Repo：** https://github.com/Aiden4939/line-reminder-bot  
> **Infra：** https://github.com/Aiden4939/inwanding-infra（`line-bot` service）

---

## A. 專案在做什麼

LINE 提醒 Bot：文字指令建立 / 查詢 / 取消提醒，到期 push 通知。支援好友、群組、聊天室。

技術棧：Express + TypeScript + PostgreSQL + node-cron + `@line/bot-sdk` + OpenAI（hybrid NLU）

---

## B. 2026-06-23 已完成（已 push `main`）

### 功能

| 功能 | 說明 | 關鍵檔案 |
|------|------|----------|
| **Rich Menu** | 三格：查詢提醒 / 使用說明 / 指令範例 | `scripts/setup-rich-menu.ts` |
| **Flex 卡片** | 查詢提醒時 carousel（最多 12 張），可 postback 取消 | `src/services/flexMessageBuilder.ts` |
| **OpenAI NLU** | `hybrid`：規則優先，無法解析再 LLM | `commandResolver.ts`, `llmReminderParser.ts` |
| **Postback** | webhook 處理 `action=cancel&id=N`、`action=help` | `lineWebhook.ts`, `reminderService.ts` |
| **無 LIFF** | 依使用者要求，未實作 LIFF | — |

### NLU 靜默失敗修正（`2e337d8` + follow-up）

- **問題**：LLM 回傳 `hour=24`（如 `2026-06-24 24:30`）→ `truncateToMinute` throw → webhook 不回 LINE
- **修正**：
  - `parseAbsoluteDateTime` 拒絕 hour≥24、minute≥60；`truncateToMinute` 回傳 `null` 不 throw
  - `mapLlmPayload` 畸形時間 → `invalid_datetime_format`
  - webhook catch 用 `replyToken` 回覆（非時間專用誤導文案）
  - OpenAI client timeout 20s（`LLM_PARSE_TIMEOUT_MS`）
- **Bugbot review follow-up**：修正 `parseAbsoluteDateTime` 分鐘捕獲 regression（regex 三群組）

### Bugbot 修正（`98ef23a`）

- 明確 help（使用說明 / 說明 / help）標 `explicit_help`，不進 LLM
- LLM `remind_at` 優先依 `env.tz` 解析
- OpenAI 請求逾時 `LLM_PARSE_TIMEOUT_MS`（預設 20s）

### CI / 型別修正（`eacdd9a`, `d42283a`）

- `lineWebhook.ts`：窄化 event 型別再取 `replyToken`
- `flexMessageBuilder`：`RecurrenceType`、測試 fixture 型別

### Git 最新 commit

| Commit | 說明 |
|--------|------|
| `2e337d8` | NLU 畸形 datetime 靜默失敗修復 |
| `129274e` | NEXT_SESSION 交接文件 |
| `d42283a` | flex test `RecurrenceType` |
| `230558f` | Rich Menu + Flex + OpenAI NLU |

---

## C. 遠端部署現況（使用者已 deploy，2026-06-23）

| 項目 | 狀態 |
|------|------|
| GHCR image build | ✅ 通過（待 redeploy `2e337d8` 後最新版） |
| `line-bot` deploy（web-ubuntu） | ✅ 已部署；**建議 redeploy** 含 NLU 修復版 |
| **Rich Menu 顯示** | ❌ **需手動跑腳本**（見下方） |
| **Flex 卡片** | ⚠️ 需「查詢提醒」且有待發送提醒；`FLEX_LIST_ENABLED=true` |
| **OpenAI 自然語言** | ⚠️ 需主機 `.env` 有 `TELEGRAM_OPENAI_API_KEY`（compose 共用） |

### Rich Menu 為何 deploy 後看不到？

**Docker deploy 不會建立 Rich Menu。** 需對 LINE API 執行一次：

```bash
cd line-reminder-bot
# .env 需 LINE_CHANNEL_ACCESS_TOKEN、LINE_CHANNEL_SECRET
npm install
npm run setup-rich-menu
```

- 選單圖：`assets/rich-menu.png`（2500×843），沒有則腳本警告，需至 LINE Manager 手傳
- 可在本機跑（用同一 Channel token），不必在容器內

### Flex 卡片何時出現？

- 使用者輸入「**查詢提醒**」（或 Rich Menu 第一格）
- 且 DB 有 **pending** 提醒
- 不會在開啟聊天時自動出現

### OpenAI 何時會被呼叫？

`NLU_MODE=hybrid` 且 `OPENAI_API_KEY` 有值時，僅當規則 parser 回 `{ type: "help" }` **且無 reason** 才呼叫 LLM。

**不支援：**「每小時重複」— 僅 daily / weekly / monthly + 一次性提醒。  
**主機確認：**

```bash
docker exec svc-line-bot printenv NLU_MODE OPENAI_API_KEY
```

---

## D. Infra 相關（`inwanding-infra`）

| 變數 | 說明 |
|------|------|
| `TELEGRAM_OPENAI_API_KEY` | line-bot 與 telegram-bot **共用**（`OPENAI_API_KEY` 注入） |
| `LINE_BOT_NLU_MODE` | 預設 `hybrid` |
| `LINE_BOT_FLEX_LIST_ENABLED` | 預設 `true` |

compose：`line-bot` + `line-bot-db` + nginx `linebot.inwanding.com`

**Deploy 前記得：** `cd ~/inwanding-infra && git pull`（workflow 不會自動 pull）

---

## E. 已知限制 / Bugbot infra 待辦（未修）

- Deploy workflow 不含 `git pull`（`inwanding-infra`）
- `telegram-bot` workspace 掛載 `:ro`，dev 無法寫檔
- 4GB 主機無 memory limit
- 備份腳本未含 `line-bot-db`

---

## F. 環境變數速查（`.env.example`）

```env
OPENAI_API_KEY=          # 本機開發；遠端由 TELEGRAM_OPENAI_API_KEY 注入
NLU_MODE=hybrid
FLEX_LIST_ENABLED=true
LLM_PARSE_TIMEOUT_MS=20000
```

---

## G. 本機開發注意

- 本機 Windows 環境 `npm` / `tsc` 曾 **segfault**，型別檢查靠 **CI Docker build**
- 使用者要求：**未明說前不要 commit / push**
- Git 全域已改 `Aiden4939`；`uv` 已裝（Serena MCP 用，與本 repo 無關）

---

## H. 建議下一手

1. **Redeploy `line-bot`**（含 `2e337d8` NLU 修復）
2. 主機確認 `TELEGRAM_OPENAI_API_KEY` 有值
3. 跑 `npm run setup-rich-menu` → LINE 底部選單
4. 測試：自然語言「明天早上 9 點開會」；畸形時間應回「時間格式錯誤」非靜默
5. （可選）CI 加 `typecheck` job、infra deploy 加 `git pull`
6. （可選）每小時重複提醒 — **新需求**，目前不支援

## I. Bugbot review 備註（2026-06-24）

| Finding | 處理 |
|---------|------|
| `parseAbsoluteDateTime` 分鐘遺失 | ✅ 已修（match[2]/[3]） |
| webhook catch 誤導文案 | ✅ 改為通用錯誤訊息 |
| LLM timeout 30s > replyToken | ✅ 維持 20s 預設 |
| reply 失敗但 DB 已寫入 | ⚠️ 已知限制，未改商業邏輯 |

---

## J. 關鍵檔案地圖

```
src/services/commandParser.ts    # 規則解析
src/services/commandResolver.ts  # hybrid → LLM
src/services/llmReminderParser.ts
src/services/flexMessageBuilder.ts
src/services/reminderService.ts  # 執行指令、Flex 列表、postback
src/routes/lineWebhook.ts
scripts/setup-rich-menu.ts       # Rich Menu（手動）
```

---

## K. 新對話開場白（複製貼上）

> 請先讀 `line-reminder-bot/docs/NEXT_SESSION.md` 和 `inwanding-infra/docs/NEXT_SESSION.md`，我們在 web-ubuntu 已 deploy line-bot，Rich Menu 可能還沒跑 setup-rich-menu。

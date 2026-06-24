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

## B. 2026-06-24 已完成（待 redeploy）

### 功能

| 功能 | 說明 | 關鍵檔案 |
|------|------|----------|
| **LLM 僅建立提醒** | hybrid 維持；LLM 只解析 create / create_recurring；查詢/取消/閒聊 →「建立提醒失敗」；驗證錯誤（缺內容、時間格式）仍回具體提示 | `commandResolver.ts`, `llmReminderParser.ts` |
| **建立提醒精靈** | 文字「建立提醒」→ 選一次性/重複 → 選時間 → 輸入內容；session 存 DB（30 分鐘 TTL） | `createReminderWizard.ts`, `conversationSessionRepository.ts` |
| **開啟/關閉提醒** | 全域 push 開關（每對話每位使用者）；提醒保留 DB | `notificationSettingsRepository.ts`, `reminderScheduler.ts` |
| **重複提醒控制** | Flex 卡片：暫停重複 / 恢復重複 / 跳過下次（僅 postback，無文字指令） | `flexMessageBuilder.ts`, `reminderRepository.ts` |
| **Rich Menu 四格** | 建立提醒 \| 查詢提醒 \| 使用說明 \| 指令範例 | `scripts/setup-rich-menu.ts` |

### DB schema 新增（啟動時 `ensureSchema` 自動 migrate）

- `user_notification_settings` — 全域 push 開關
- `conversation_sessions` — 建立提醒精靈狀態
- `reminders.is_paused`、`reminders.skip_next_once` — 重複提醒暫停/跳過

### Scheduler 行為

| 情境 | 行為 |
|------|------|
| 全域關閉 + 一次性 | 維持 `pending`，不 push；開啟後補發 |
| 全域關閉 + 重複 | 不 push，仍推進 `remind_at`（避免排程卡住） |
| `is_paused` | 不 claim、不 push、不推進 |
| `skip_next_once` | 跳過本次 push，推進下次並清 flag |

### Bugbot review 修正（同次實作）

| Finding | 處理 |
|---------|------|
| LLM 驗證錯誤被蓋成「建立提醒失敗」 | ✅ `resolveLlmHybridResult` 保留 `help` + `reason` |
| Flex postback 未清除精靈 session | ✅ `handlePostback` 非 wizard 操作前清 session |
| 閒聊顯示「建立提醒失敗」 | ✅ 依產品規格保留 |
| 關閉通知時重複提醒仍推進 | ✅ 依產品規格保留 |

### 測試

- `npm test`：42 項全過
- `npm run build`：通過

---

## C. 2026-06-23 已完成（已 push `main`）

| 功能 | 說明 |
|------|------|
| Rich Menu（舊三格） | 查詢提醒 / 使用說明 / 指令範例 |
| Flex 卡片 | carousel 查詢列表 + 取消 postback |
| OpenAI NLU hybrid | 規則優先，無法解析再 LLM |
| NLU 靜默失敗修復 | `2e337d8`, `7fe3ac3` |

---

## D. 遠端部署現況

| 項目 | 狀態 |
|------|------|
| GHCR image build | ⚠️ 待 push 後 CI build |
| `line-bot` deploy（web-ubuntu） | ⚠️ **需 redeploy** 含本次 schema + 功能 |
| **Rich Menu** | ❌ **需重新跑腳本**（已改四格，見下方） |
| **建立提醒精靈** | ⚠️ 需 redeploy + DB migrate（啟動自動） |
| **OpenAI 自然語言** | ⚠️ 僅建立提醒；需 `TELEGRAM_OPENAI_API_KEY` |

### Rich Menu 更新步驟

```bash
cd line-reminder-bot
npm install
npm run setup-rich-menu
```

- 選單圖：`assets/rich-menu.png`（2500×843，建議改四格版面）
- Docker deploy **不會**自動建立 Rich Menu

### OpenAI 何時會被呼叫？

`NLU_MODE=hybrid` 且 `OPENAI_API_KEY` 有值時，僅當規則 parser 回 `{ type: "help" }` **且無 reason** 才呼叫 LLM。  
LLM **僅**回 `create` / `create_recurring`；其他意圖 →「建立提醒失敗」。

**不支援：** 每小時重複（僅 daily / weekly / monthly + 一次性）。

---

## E. Infra 相關（`inwanding-infra`）

| 變數 | 說明 |
|------|------|
| `TELEGRAM_OPENAI_API_KEY` | line-bot 與 telegram-bot 共用 |
| `LINE_BOT_NLU_MODE` | 預設 `hybrid` |
| `LINE_BOT_FLEX_LIST_ENABLED` | 預設 `true` |

compose：`line-bot` + `line-bot-db` + nginx `linebot.inwanding.com`

**Deploy 前記得：** `cd ~/inwanding-infra && git pull`

---

## F. 已知限制 / 待辦

- Deploy workflow 不含 `git pull`（`inwanding-infra`）
- reply 失敗但 DB 已寫入 — 已知，未改
- 備份腳本未含 `line-bot-db`
- 每小時重複提醒 — 未支援

---

## G. 環境變數速查

```env
OPENAI_API_KEY=
NLU_MODE=hybrid
FLEX_LIST_ENABLED=true
LLM_PARSE_TIMEOUT_MS=20000
```

---

## H. 建議下一手

1. **Redeploy `line-bot`**（含本次 commit）
2. 跑 `npm run setup-rich-menu`（四格選單 + 更新選單圖）
3. 測試：
   - 「建立提醒」精靈全流程
   - 「開啟提醒」/「關閉提醒」
   - 查詢提醒 → Flex「暫停重複」「跳過下次」
   - 自然語言「明天早上 9 點開會」
   - 閒聊應回「建立提醒失敗」；缺內容的自然語言應回具體提示
4. （可選）更新 `assets/rich-menu.png` 四格設計

---

## I. 關鍵檔案地圖

```
src/services/commandParser.ts           # 規則解析（含開啟/關閉/建立提醒）
src/services/commandResolver.ts         # hybrid → LLM（resolveLlmHybridResult）
src/services/llmReminderParser.ts
src/services/createReminderWizard.ts    # 建立提醒精靈
src/services/reminderMessages.ts        # 回覆文案
src/services/flexMessageBuilder.ts      # Flex + 暫停/跳過按鈕
src/services/reminderService.ts         # 執行指令、postback、精靈路由
src/repositories/notificationSettingsRepository.ts
src/repositories/conversationSessionRepository.ts
src/jobs/reminderScheduler.ts
src/routes/lineWebhook.ts
scripts/setup-rich-menu.ts
```

---

## J. 新對話開場白（複製貼上）

> 請先讀 `line-reminder-bot/docs/NEXT_SESSION.md`。我們已完成 Hybrid NLU 強化（LLM 僅建立提醒）、建立提醒精靈、開啟/關閉提醒、重複提醒暫停/跳過。待 redeploy 與重跑 setup-rich-menu（四格）。

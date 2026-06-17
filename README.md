# LINE Reminder Bot

Node.js + TypeScript 打造的 LINE 提醒 Bot 後端。使用者可透過文字指令建立、查詢、取消提醒，到期後由 Bot 以 LINE push message 發送通知。支援好友、群組與聊天室（room）情境。

## 功能概覽

- `GET /health`：健康檢查（含資料庫連線）
- `POST /webhook/line`：接收 LINE webhook，驗證 `X-Line-Signature`
- PostgreSQL 持久化提醒資料
- 背景排程每分鐘檢查到期提醒並 push
- Docker 化部署，CI 自動 build 並 push 至 GHCR

---

## 本機啟動方式

### 前置需求

- Docker / Docker Compose
- LINE Developers Channel（Messaging API）
- ngrok（本機 webhook 測試用）

### 使用 Docker Compose（建議）

```bash
# 1. 複製環境變數範本
cp .env.example .env

# 2. 編輯 .env，填入 LINE 憑證（見下方說明）

# 3. 啟動服務
docker compose -f docker-compose.dev.yml up --build -d

# 4. 確認健康狀態（建議等待數秒後再執行）
sleep 3
curl http://localhost:3000/health
# 預期：{"ok":true}

# 5. 查看 log
docker compose -f docker-compose.dev.yml logs -f app
```

### 不使用 Docker（本機開發）

需自行準備 PostgreSQL，並將 `.env` 的 `DB_HOST` 改為 `localhost`（或你的 DB 位址）。

```bash
npm install
npm run build
npm start

# 或開發模式（熱重載）
npm run dev
```

### 停止服務

```bash
docker compose -f docker-compose.dev.yml down
```

---

## `.env` 設定說明

複製 `.env.example` 為 `.env` 後填入：

| 變數 | 必填 | 說明 | 範例 |
|------|------|------|------|
| `PORT` | 否 | HTTP 監聽 port | `3000` |
| `TZ` | 否 | 絕對時間解析時區 | `Asia/Taipei` |
| `LINE_CHANNEL_SECRET` | **是** | LINE Channel secret | 從 LINE Console 取得 |
| `LINE_CHANNEL_ACCESS_TOKEN` | **是** | LINE Channel access token | 從 LINE Console 取得 |
| `DB_HOST` | **是** | PostgreSQL host | Docker：`db`；本機：`localhost` |
| `DB_PORT` | 否 | PostgreSQL port | `5432` |
| `DB_NAME` | **是** | 資料庫名稱 | `line_reminder` |
| `DB_USER` | **是** | 資料庫使用者 | `appuser` |
| `DB_PASSWORD` | **是** | 資料庫密碼 | `devpassword` |
| `REMINDER_CRON` | 否 | 排程 cron 表達式 | `* * * * *`（每分鐘） |

> **注意：** 請勿將 `.env` 提交至版控。LINE 憑證與 DB 密碼一律透過環境變數注入。

---

## LINE Developers 設定流程

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 建立或選擇 Provider → 建立 **Messaging API** Channel
3. 於 **Basic settings** 複製 **Channel secret** → 填入 `.env` 的 `LINE_CHANNEL_SECRET`
4. 於 **Messaging API** 發行 **Channel access token** → 填入 `.env` 的 `LINE_CHANNEL_ACCESS_TOKEN`
5. 於 **Messaging API** 設定：
   - 開啟 **Use webhook**
   - **Webhook URL** 設為你的公開 HTTPS 網址（見下方 ngrok 流程）
   - 點 **Verify** 確認連線成功
6. 前往 [LINE Official Account Manager](https://manager.line.biz/) → **設定** → **回應設定**：
   - **回應模式** 設為 **Bot**（關閉 Chat / 聊天）
   - 關閉 **自動回應訊息**（Auto-reply messages），否則會先收到「感謝您的訊息！很抱歉，本帳號無法個別回覆…」等罐頭訊息，才收到 Bot 回覆
7. 掃描 **QR code** 加 Bot 為好友（或將 Bot 邀入群組測試）

重啟 app 使 `.env` 生效：

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

---

## ngrok 測試流程

LINE webhook 需要 **HTTPS 公網 URL**，本機 `localhost` 無法直接使用。

### 1. 確認本機 app 正常

```bash
curl http://localhost:3000/health
# 預期：{"ok":true}
```

### 2. 啟動 ngrok

另開 terminal：

```bash
ngrok http 3000
```

記下 **Forwarding** 的 HTTPS 網址，例如：

```
https://xxxx-xxxx.ngrok-free.app
```

### 3. 設定 LINE Webhook URL

填入完整路徑：

```
https://<你的-ngrok-網域>/webhook/line
```

範例：

```
https://74ee-2001-b400-e287-355-250e-c1ad-553-4cba.ngrok-free.app/webhook/line
```

> 網址必須包含 `.ngrok-free.app`（或 `.ngrok.io`）等完整網域，不能只貼 IPv6 轉址片段。

### 4. 驗證

- 在 LINE Console 點 **Verify** → 應顯示成功
- 也可從外部測試：

```bash
curl https://<你的-ngrok-網域>/health
# 預期：{"ok":true}
```

### 5. 注意事項

- ngrok 每次重啟，免費版網域可能改變，需重新更新 LINE Webhook URL
- ngrok 與 `docker compose` 需同時運行

---

## 支援指令

在 LINE 對話中傳送以下文字指令：

| 指令 | 範例 | 說明 |
|------|------|------|
| 建立（相對時間） | `提醒我 5分鐘後 喝水` | N 分鐘後 push 提醒 |
| 建立（絕對時間） | `提醒我 2026-06-11 15:30 開會` | 指定日期時間（依 `TZ` 時區） |
| 建立（每日重複） | `每天 09:00 喝水` | 每天固定時間重複，直到取消 |
| 建立（每週重複） | `每週一 09:00 開會` | 每週固定星期與時間重複，直到取消 |
| 建立（每月重複） | `每月15日 09:00 繳費` | 每月固定日期與時間重複，直到取消 |
| 查詢 | `查詢提醒` | 列出目前對話中自己的 pending 提醒 |
| 取消 | `取消提醒 1` | 取消指定 ID 的 pending 提醒（含重複系列） |
| 其他文字 | `help` | 回覆使用說明 |

建立成功時 Bot 會 reply 確認訊息；到期時 Bot 會 **push** 提醒內容。重複提醒送出後會自動排程下一次。

### 可接受指令變體

- `提醒我5分鐘後 喝水`（`提醒我` 與分鐘數可貼齊）
- `提醒我 5 分鐘後 喝水`（`5` 與 `分鐘` 之間可有空白）
- `查詢`、`清單`（等同 `查詢提醒`）
- `取消 12`（等同 `取消提醒 12`）
- `每天提醒我 09:00 喝水`（等同 `每天 09:00 喝水`）
- `每週一提醒我 09:00 開會`（等同 `每週一 09:00 開會`）
- `每月15日提醒我 09:00 繳費`（等同 `每月15日 09:00 繳費`）

### 常見錯誤輸入與回覆

| 輸入 | 系統回覆方向 |
|------|--------------|
| `提醒我 2026-13-40 09:30 開會` | 提示時間格式錯誤，並附可複製範例 |
| `提醒我 10分鐘後` | 提示缺少提醒內容，並附可複製範例 |
| `取消提醒 abc` | 提示 ID 必須是數字，並附可複製範例 |
| `每天 09:00` | 提示缺少提醒內容 |
| `每月32日 09:00 繳費` | 提示日期必須是 1-31 |
| 其他未知文字 | 回覆精簡版使用說明 |

> 每月 31 日這類日期，若當月沒有該日（如 2 月），會改在當月最後一天提醒。

---

## E2E 測試流程

以下為完整手動端到端驗證步驟：

### 準備

```bash
docker compose -f docker-compose.dev.yml up --build -d
ngrok http 3000   # 另開 terminal
# 設定 LINE Webhook URL 並 Verify 成功
```

### 測試 1：Webhook 與回覆

1. 對 Bot 傳送任意無法識別的文字（如 `hello`）
2. 預期：Bot reply 使用說明

### 測試 2：建立相對時間提醒

1. 傳送：`提醒我 2分鐘後 E2E測試`
2. 預期：Bot reply `已建立提醒 #N，將於 ... 提醒您：E2E測試`

### 測試 3：查詢提醒

1. 傳送：`查詢提醒`
2. 預期：列出含 `#N` 的 pending 提醒

### 測試 4：取消提醒

1. 傳送：`取消提醒 N`（N 為上一步的 ID）
2. 預期：Bot reply `已取消提醒 #N`
3. 再傳送 `查詢提醒`，預期：無待發送提醒

### 測試 5：到期 push

1. 傳送：`提醒我 2分鐘後 push測試`
2. 等待約 2 分鐘
3. 預期：收到 push `提醒時間到！...`
4. 確認資料庫狀態：

```bash
docker exec line-reminder-bot-db-1 psql -U appuser -d line_reminder \
  -c "SELECT id, status, error_message FROM reminders ORDER BY id DESC LIMIT 5;"
# 預期：status = sent
```

### 測試 6：群組（可選）

1. 將 Bot 邀入群組
2. 在群組傳送 `提醒我 3分鐘後 群組測試`
3. 到期後應 push 至群組

### 觀察 log

```bash
docker compose -f docker-compose.dev.yml logs -f app
```

成功 push 時會出現：`[scheduler] Sent reminder #N`

### UAT 快速驗收清單（建議 10-15 條）

1. `提醒我 2分鐘後 UAT測試`
2. `提醒我2分鐘後 UAT貼齊測試`
3. `提醒我 2 分鐘後 UAT空白測試`
4. `提醒我 2026-06-30 10:00 開會`
5. `提醒我 2026-13-30 10:00 開會`（預期：時間格式錯誤提示）
6. `提醒我 10分鐘後`（預期：缺少內容提示）
7. `查詢提醒`
8. `查詢`
9. `清單`
10. `取消提醒 1`
11. `取消 1`
12. `取消提醒 abc`（預期：ID 必須是數字）
13. `hello`（預期：回覆使用說明）
14. `每天 09:00 每日UAT`
15. `每週一 09:00 每週UAT`
16. `每月15日 09:00 每月UAT`
17. `每月31日 09:00 月末UAT`（2 月應 fallback 到月末）
18. 建立重複提醒後取消，確認不再推送

---

## 已知限制

| 項目 | 說明 |
|------|------|
| 僅支援文字指令 | 不支援圖片、貼圖、Rich Menu |
| 排程精度 | 預設每分鐘檢查一次，實際觸發可能有最多約 1 分鐘誤差 |
| 單一 cron 實例假設 | 多實例部署需確保只有一個 scheduler 運行，或另行設計分散式排程 |
| `processing` 殘留 | 若 push 途中程序崩潰，提醒可能停在 `processing` 狀態，不會自動重試 |
| 自動化測試覆蓋有限 | 目前有 parser / 文案層級測試，仍以手動 E2E 為主 |
| 無正式部署 compose | 僅提供 `docker-compose.dev.yml`，正式環境需自行規劃 HTTPS、Secrets、DB 等 |
| ngrok 免費版 | 網域不固定，不適合長期 production webhook |
| 查詢範圍 | `查詢提醒` 僅顯示當前對話來源 + 自己的 pending 提醒 |

---

## 下一步開發項目

### 正式部署（P1）

- [ ] 新增 production 用 `docker-compose.yml` 或 K8s manifest
- [ ] HTTPS 反向代理（Nginx / Caddy / ALB）
- [ ] Secrets 管理（非 plain `.env`）
- [ ] 結構化 logging 與監控
- [ ] DB 備份與 migration 版本化

### 可靠性（P1）

- [ ] `processing` 狀態 recovery job（逾時重設或標記 failed）
- [ ] 多實例部署時的 scheduler _leader 選舉

### 產品功能（P2，視需求）

- [ ] Rich Menu
- [ ] 多語系
- [ ] 後台管理介面
- [ ] 單元 / 整合測試

### CI/CD（P2）

- [ ] GitHub Actions 加入 deploy workflow（目前僅 build & push GHCR image）

---

## 專案結構

```
src/
├── routes/          # HTTP 路由（health、webhook）
├── services/        # 業務邏輯（指令解析、提醒、LINE API）
├── repositories/    # 資料存取
├── jobs/            # 背景排程
├── utils/           # 工具（signature、日期解析）
├── db/              # DB pool 與 schema
└── config/          # 環境變數
```

## Docker Image

Push 至 `main` 分支後，GitHub Actions 會 build 並 push：

```
ghcr.io/aiden4939/line-reminder-bot:latest
ghcr.io/aiden4939/line-reminder-bot:<git-sha>
```

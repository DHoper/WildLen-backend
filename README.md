# WildLen-backend

WildLens（野生動物攝影社群）的 REST API。

- **網站**：[WildLen-website](https://github.com/DHoper/WildLen-website)
- **後台**：[WildLen-admin](https://github.com/DHoper/WildLen-admin)

## 技術

Node.js 20+ · Express 5 · Prisma 6 · PostgreSQL · Zod 4 · JWT + Refresh Token · Resend（Email）· pino · Cloudinary（未設定時改存本機 `./uploads`）· Vitest + Supertest · Docker

## 快速開始

```sh
npm install
cp .env.example .env            # 填入 JWT_SECRET 等設定

# 沒有安裝 Postgres / Docker？用內建的本機資料庫（另開一個終端機）：
npm run db:local                # DATABASE_URL=postgresql://postgres:postgres@localhost:5433/wildlen

npm run db:deploy               # 套用 migrations
npm run db:seed -- --demo       # 建立管理員（ADMIN_EMAIL / ADMIN_PASSWORD）、物種圖鑑、地點＋示範資料
npm run data:import-inat        # 匯入 iNaturalist 觀察（離線，讀 prisma/data/；可重跑）
npm run dev                     # http://localhost:3000/api/v1
```

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 開發模式（tsx watch） |
| `npm run build` / `npm start` | 編譯至 `dist/` 並執行 |
| `npm test` | 整合測試（自動啟動臨時 PostgreSQL，不需外部資料庫） |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run db:migrate` | 開發中修改 schema 後產生 migration |
| `npm run db:studio` | Prisma Studio |

## 專案結構

```
src/
  config/env.ts          環境變數（zod 驗證，缺漏時啟動即失敗）
  lib/                   prisma、jwt、錯誤、i18n（中英訊息）、logger、mailer、分頁、儲存、Quill Delta、共用 schema
  middleware/            auth（attachLocale / attachUser / requireAuth / requireVerified / requireAdmin）、錯誤處理
  modules/
    auth/  users/  articles/  photos/  community/  polls/
    species/             物種圖鑑、物種統計
    community/           討論區：看板、主題、採納解答、置頂 / 鎖定、貢獻排行
    notifications/       按讚 / 留言 / 追蹤 / 鑑定 / 採納解答通知
    social/              封鎖（雙向隱藏）
    reports/             檢舉、後台審核佇列
    engagement/          留言、按讚、收藏、瀏覽數（三種內容共用）
    images/              上傳、與內容綁定同步、孤兒圖片清理
    admin/               儀表板統計、使用者管理、留言管理
    meta/                標籤分類
prisma/
  schema.prisma  migrations/  seed.ts  species-data*.ts（物種圖鑑中英資料）
tests/                   API 整合測試
```

## API 概覽

所有路徑以 **`/api/v1`** 開頭（`/api` 為相容舊版的別名，兩者完全相同）。需要登入的請求帶 `Authorization: Bearer <accessToken>`。

- 列表統一回傳 `{ items, total, page, pageSize, totalPages }`，參數 `page`、`pageSize`（≤ 50）、`q`、`tag`、`authorId`、`sort=latest|popular`
- 錯誤統一回傳 `{ error: { code, message, details? } }`；`message` 依語言回傳中文或英文
- 語言：`?lang=en|zh-TW` 優先，其次 `Accept-Language`，預設 `zh-TW`
- 每個回應都帶 `x-request-id`（可由用戶端傳入沿用）

| 資源 | 端點 |
| --- | --- |
| 驗證 | `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `POST /auth/logout-all` `GET /auth/me` `GET /auth/email-available?email=` |
| Email | `POST /auth/verify-email` `POST /auth/resend-verification` `POST /auth/forgot-password` `POST /auth/reset-password` |
| 我的帳號 | `PATCH /users/me`（含 `locale`）`PUT /users/me/password` `DELETE /users/me`（`{ password }`）`GET /users/me/export` `GET /users/me/bookmarks?type=photo\|community\|article` `GET /users/me/blocks` |
| 使用者 | `GET /users/:id`（`stats`、`followedByMe`）`GET /users/:id/species`（生涯物種清單）`GET /users/:id/followers` `GET /users/:id/following` `PUT/DELETE /users/:id/follow` `PUT/DELETE /users/:id/block` |
| 動態牆 | `GET /feed`（追蹤對象的照片，最新在前） |
| 照片 | `GET /photos`（另可 `speciesId`、`month=1-12`、`quality=CASUAL\|NEEDS_ID\|CONFIRMED`）`GET /photos/map` `GET /photos/:id` `POST` `PATCH /:id` `DELETE /:id` |
| 物種鑑定 | `GET /photos/:id/identifications` `POST /photos/:id/identifications`（`{ speciesId, comment? }`）`DELETE /photos/:id/identifications/me` |
| 物種 | `GET /species?q=&group=&sort=popular\|name` `GET /species/in-season?month=&limit=` `GET /species/:id`（含 `stats`）· 管理員：`POST` `PATCH /:id` `DELETE /:id` |
| 文章 | `GET /articles?locale=zh-TW\|en` `GET /articles/:id` · 管理員：`POST` `PATCH /:id` `DELETE /:id` |
| 討論區 | `GET /community/categories` `GET /community/top-contributors?days=&limit=` |
| 討論區主題 | `GET /community-posts?category=&type=&filter=unanswered\|solved\|unsolved&sort=activity\|latest\|popular` `GET /:id` `POST` `PATCH /:id` `DELETE /:id` `POST/DELETE /:id/accept` · 管理員：`PATCH /:id/moderation` |
| 互動（照片、貼文、文章） | `GET /:id/comments?threaded=1&sort=oldest\|newest\|top` `POST /:id/comments`（`{ content, parentId? }`）`PUT/DELETE /:id/like` `PUT/DELETE /:id/bookmark` `POST /:id/views` |
| 留言 | `PATCH /comments/:id` `DELETE /comments/:id` `PUT/DELETE /comments/:id/like` |
| 投票 | `GET /polls?filter=active\|ended\|mine\|voted` `GET /polls/:id` `POST /polls` `POST /polls/:id/ballots` `DELETE /polls/:id` |
| 通知 | `GET /notifications` `GET /notifications/unread-count` `POST /notifications/read`（`{ ids? }`，省略即全部已讀） |
| 檢舉 | `POST /reports`（`{ targetType, targetId, reason, note? }`） |
| 圖片 | `POST /images?folder=photos\|community\|articles`（multipart，欄位 `images`）`DELETE /images/:id` |
| 後台 | `GET /admin/stats` `GET/PATCH/DELETE /admin/users/:id` `PUT /admin/users/:id/password` `GET /admin/comments` `GET /admin/reports?status=` `PATCH /admin/reports/:id` |
| 其他 | `GET /meta/tags` `GET /health`（含資料庫檢查，失敗回 503） |

### 登入與 Token

- 登入 / 註冊 / refresh 回傳 `{ accessToken, refreshToken, expiresIn, user }`
- Access token（JWT）15 分鐘；refresh token 30 天、**每次使用都會換新**，資料庫只存 SHA-256
- 已用過的 refresh token 再次出現視為外洩，該登入階段（family）的所有 token 立即失效
- `logout` 登出目前裝置；`logout-all` 與重設密碼會登出所有裝置（已發出的 access token 最多再有效 15 分鐘）

### Email

- 有設定 `RESEND_API_KEY` 時透過 Resend 寄出；未設定時信件內容（含連結）會印在 log，方便本機開發
- 信件語言依使用者的 `locale`；連結為 `${APP_URL}/verify-email?token=…`、`${APP_URL}/reset-password?token=…`（英文使用者加 `/en` 前綴）
- 驗證連結 48 小時、重設連結 1 小時有效，皆只能使用一次；`forgot-password` 不論帳號是否存在都回 204
- `REQUIRE_EMAIL_VERIFICATION=true` 時，未驗證的帳號建立照片 / 貼文 / 投票 / 留言會得到 403 `EMAIL_NOT_VERIFIED`

### 權限

- 編輯 / 刪除：只有作者本人或管理員（`role = ADMIN`）可以
- 文章只有管理員能寫；草稿只有管理員看得到
- 投票結果在投票後、截止後，或作者 / 管理員查看時才公開

### 照片位置隱私

照片的 `locationPrecision` 決定其他人看到的座標（作者本人與管理員一律看到精確座標）：

| 值 | 其他人看到的座標 |
| --- | --- |
| `EXACT` | 原始座標 |
| `APPROX` | 0.1° 網格（約 11 公里）的中心點 |
| `HIDDEN` | `null`，且不出現在 `/photos/map` |

物種標記為 `sensitive`（如綠蠵龜、黑面琵鷺、石虎）時，伺服器不接受 `EXACT`，會自動改為 `APPROX`。月份篩選與物種月份統計一律以**台北時間**計算。

### 社群鑑定與資料品質

照片的 `quality`：

- `CASUAL`：沒有拍攝時間，或位置為 `HIDDEN`
- `CONFIRMED`：已標記物種，且同意該物種的票數 ≥ 2 並 ≥ 全部票數的 2/3
- `NEEDS_ID`：其他情況

票數 = 作者標記的物種（一票）+ 每一筆鑑定；作者自己也送出鑑定時，以該鑑定取代作者那一票。每人每張照片一筆鑑定，再次送出即更新。

### 討論區

- **看板**（`ForumCategory`）：物種鑑定求助、新手提問、拍攝技巧、器材討論、野外紀錄、保育議題、行程揪團、站務公告（僅管理員可發文）；名稱與說明依語言回傳
- **主題**：建立時必須選看板（`categoryKey`），類型為 `DISCUSSION` 或 `QUESTION`。列表預設 `sort=activity`：置頂優先，再依最後活動時間（每則新留言都會更新）；`latest` / `popular` 也一律置頂優先
- **列表欄位**：`category`、`type`、`pinned`、`locked`、`solved`、`lastActivityAt`、`lastReplier`、`participants`（最多 5 位最近回覆者，不含作者）、`replyCount`
- **採納解答**：只有 `QUESTION` 可以採納，由作者或管理員操作；被採納者會收到 `ANSWER_ACCEPTED` 通知
- **置頂 / 鎖定**：管理員以 `PATCH /:id/moderation` 設定；鎖定的主題一般使用者無法回覆（403 `POST_LOCKED`），管理員仍可回覆
- **留言串**：回覆只有一層——回覆某則回覆時會自動掛到其上層留言下，並通知被回覆的人。`?threaded=1` 以上層留言分頁（預設由舊到新），每則附上全部 `replies`；不帶參數時維持原本的扁平列表（由新到舊）。每則留言含 `likeCount`、`likedByMe`、`edited`、`parentId`、`isAuthor`（是否為原 PO）
- **貢獻排行**：分數 = 主題 × 3 + 回覆 × 1 + 被採納的解答 × 5（只計討論區；採納自己的回覆不計分）

### 通知

按讚、留言、回覆、追蹤、鑑定、採納解答會通知對方（自己對自己不會）。取消按讚 / 追蹤 / 鑑定會一併移除尚未讀取的對應通知。

### 檢舉與封鎖

- 同一人對同一目標只能有一筆處理中（`OPEN`）的檢舉；管理員於 `/admin/reports` 處理（`RESOLVED` / `DISMISSED`）
- 封鎖是雙向的：彼此看不到對方的照片、貼文、投票、留言與通知；也不能對對方的內容留言、按讚、收藏、鑑定或追蹤（403）。封鎖時會自動解除雙方的追蹤

### 雙語

- 錯誤與驗證訊息皆有中英文版本（`src/lib/i18n.ts`）
- 標籤以 key 儲存（如 `birds`、`forest`）；`GET /meta/tags` 回傳 `[{ key, color, label: { 'zh-TW', en }, tags: [{ key, label }] }]`，寫入時只接受 key
- 物種有 `englishName`、`descriptionEn`；文章有 `locale`

### 圖片流程

1. `POST /images` 上傳，取得 `{ id, url }`
2. 照片貼文：建立 / 更新時帶 `imageIds`（順序即顯示順序）
3. 文章、社區貼文：直接把 `url` 嵌入 Quill 內容，伺服器會依內容自動綁定
4. 從內容移除、或刪除貼文時，圖片會一併從儲存空間刪除；上傳後 24 小時仍未使用的圖片會被自動清除

## 部署

### Docker

```sh
JWT_SECRET=$(openssl rand -base64 48) docker compose up --build   # PostgreSQL + API，http://localhost:3000
docker compose run --rm seed                                      # 管理員帳號 + 物種圖鑑（加 --demo 建立示範資料）
```

映像檔（`Dockerfile`，node 22-alpine 多階段建置）啟動時會先執行 `prisma migrate deploy` 再啟動 API；健康檢查使用 `GET /api/v1/health`。

升級到含 `20261111100000_photo_area` 的版本時，`migrate deploy` 之後要執行一次 `npm run db:backfill`：依座標所在的時區計算每筆觀察的區域（季節統計用），否則既有紀錄都會是 `other`。可以重複執行。

### 地點與 iNaturalist 匯入資料

地點與匯入的觀察是上線後保留的基礎資料。清單存在 `prisma/data/`（進版控），正式環境也用同一份清單離線匯入：

```sh
npm run data:import-inat        # 建立／更新地點、物種、匯入帳號與觀察；以 sourceName + sourceId 為鍵，可重跑
```

更新清單時：`npx tsx scripts/import-inat.ts fetch`（向 iNaturalist API 抓取，每秒最多 1 次請求）→ `select`（依門檻挑選並寫入 `prisma/data/`，印出各地點與物種的筆數）→ 檢查後再 `import`。只收研究等級、觀察與照片皆為 CC0 或 CC BY 的紀錄；iNaturalist 已模糊的座標不會還原，WildLens 的敏感物種在匯入時也會模糊。匯入的觀察掛在系統帳號 `inaturalist-import@system.wildlens` 底下，頁面上標示原作者、授權與原始紀錄連結。

### 正式環境變數

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `JWT_SECRET` | 至少 32 字元的隨機字串 |
| `PUBLIC_URL` | 此 API 的對外網址 |
| `APP_URL` | 網站網址（Email 連結用） |
| `CORS_ORIGINS` | 允許的前端來源，逗號分隔 |
| `RESEND_API_KEY` / `MAIL_FROM` | Email 寄送（寄件網域需完成 SPF / DKIM 驗證） |
| `REQUIRE_EMAIL_VERIFICATION` | `true` 時建立內容需先驗證 Email |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | Token 有效期（預設 900 秒 / 30 天） |
| `AUTH_RATE_LIMIT` | 驗證相關路由（登入、註冊、refresh…）每個 IP 每 15 分鐘的請求上限，預設 30；`0` 為關閉（僅建議本機 e2e 測試使用）。寄信用的限制（每帳號每小時 5 次）不受影響 |
| `CLOUDINARY_*` | 圖片儲存（正式環境必填，否則圖片存在容器本機） |
| `LOG_LEVEL` | 預設 `info`；正式環境輸出 JSON log |

### CI

`.github/workflows/ci.yml`：安裝 → `prisma generate` → 型別檢查 → 測試（內建臨時 PostgreSQL）→ 建置。

### 已知限制

- 野外日誌的天候由伺服器向 Open-Meteo 查詢（免金鑰）：90 天內用預報 API 回查，更早的日期用歷史資料 API（`archive-api.open-meteo.com`）。部署環境若連不到歷史資料 API，較舊日誌的天候會留空；天候為選填，不影響發佈。設定 `WEATHER_DISABLED=1` 可完全關閉查詢。

## 從 v1 升級

v2 重新設計了資料表（Profile 併入 User、按讚 / 留言 / 投票改為逐筆紀錄、照片座標改為經緯度欄位），migration 歷史也重新開始。舊資料庫需要另外搬移資料，不能直接 `migrate deploy`。

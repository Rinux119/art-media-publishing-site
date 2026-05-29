# Art Media Publishing Site

[简体中文](README.md) | [繁體中文（香港）](README.zh-HK.md) | [繁體中文（臺灣）](README.zh-TW.md) | [日本語](README.ja.md) | [English](README.en.md)

## 關於這個專案

這是一個基於 Node.js、Express、SQLite 和 EJS 的作品展示與媒體發佈平台。支援圖片、影片、文字等多種形式，包含完整的後台發佈工作流程、圖片變體生成和影片轉碼能力。

## 為什麼會有這個專案

我是一名創作愛好者。

構建這個系統的初衷，起初是因為我自身對商業平台僵硬的展示方式（不是九宮格就是1:1）感到不滿和束縛，同時也對於主流藝術界對「什麼是藝術」這一定義的壟斷，以及由此衍生出的對個人創作者的排擠感到無奈。

於是我透過 AI 的協助，構建了這個系統。起初這只是根據我個人的使用和展示習慣進行設計的東西，但我現在將其開源，希望各位同樣苦於演算法和學術壟斷的個人創作者都能擁有屬於自己的「白盒子」，解構「藝術作品必須依附於特定機構才能呈現」的論述。

由於我本人並非科班出身的軟件工程師，僅具備基本的伺服器維運經驗，所以我可能沒有辦法對當前系統進行進一步的優化或擴展。但我非常歡迎各位對此有需求或共鳴的朋友 fork 或使用這個專案，以滿足自己的需求。

對於 Issues，我會盡可能回覆，但不能承諾能夠解決。

對於 PR，我會盡可能理解你提交的程式碼，但不能承諾能夠接受，如果你能詳細告知我做了什麼改變，我會非常感謝。

## 特性

### 公開站點
- 首頁展示、作品集列表、大圖瀏覽、作品闡述展示

### 後台管理
- 登入認證、使用者管理、首頁素材管理、作品集管理
- 媒體上傳、排序、草稿與發佈流程

### 作品集可見性控制
| 開關        | 效果                                       |
| --------- | ---------------------------------------- |
| **隱藏入口**  | 作品集不在公開導航中顯示                             |
| **禁止存取**  | 作品集 slug 頁、大圖頁和相關 API 回傳 404（自動聯動啟用隱藏入口） |
| **隱藏資訊**  | 頁尾隱藏完整站點資訊                               |
| **顯示簡署名** | 僅在隱藏資訊時生效；顯示 `shortSignature` 文字         |

### 媒體處理
- **圖片處理**：透過 Sharp 自動生成 `thumb`、`medium`、`large` 三種尺寸變體，並對原圖進行壓縮優化
- **影片轉碼**：透過 FFmpeg 自動轉碼為 H.264/AAC MP4 格式，分辨率壓縮至 1080p，支援漸進式播放

### 系統設定
- 站點名稱、署名、備案號、社交連結、圖片/影片處理參數
- 均可線上修改，儲存後立即生效，無需重新啟動

### 多語言支援（i18n）
- **前台**：根據瀏覽器 `Accept-Language` 自動匹配語言（簡體中文、繁體中文、英文、日文）
- **後台**：語言可在系統設定頁面中手動指定

### 其他特性
- **CDN 加速**：設定 `CDN_URL` 後，媒體 URL 自動拼接 CDN 前綴
- **安全防護**：CSRF 防護、CSP/HSTS 安全標頭、IP 暴力破解鎖定、自訂異常類別
- **存取日誌**：公開頁面 IP/路徑/時間戳自動記錄，超限自動清理
- **Session 持久化**：Session 儲存於 SQLite，服務重新啟動後登入態不遺失
- **優雅關閉**：連線追蹤、健康/就緒檢查、404/500 兜底
- **自動化測試**：77 個整合測試 + 11 個單元測試，覆蓋核心工作流程、安全防護與邊界條件

## 執行要求

- Node.js `>= 18.17`
- npm `>= 9`
- FFmpeg 和 FFprobe：`npm install` 時會自動下載內建二進位（透過 `ffmpeg-static` 和 `@ffprobe-installer/ffprobe`），無需手動安裝；如需使用系統安裝的版本，可透過 `FFMPEG_PATH` / `FFPROBE_PATH` 環境變數指定

## 快速開始

### 一鍵啟動（推薦）

macOS / Linux：
```bash
./start.sh
```

Windows：
```cmd
start.bat
```

啟動腳本會自動完成以下操作：
1. 偵測 Node.js 版本（如未安裝則提示安裝方式）
2. 自動建立 `.env`（從 `.env.example` 模板生成，含隨機金鑰）
3. 自動安裝依賴（`npm install`）
4. 偵測 FFmpeg/FFprobe 可用性
5. 啟動服務

### 手動步驟

1. 安裝依賴
```bash
npm install
```
2. 啟動服務
```bash
npm start        # 生產環境
npm run dev      # 開發環境
```

> `.env` 檔案會在首次啟動時自動從 `.env.example` 建立並生成隨機金鑰，無需手動複製。

預設監聽 `http://localhost:3000`

管理後台登入地址 `http://localhost:3000/admin/login`

預設管理員帳號密碼 `admin` / `admin`

## 常用腳本

| 命令                | 說明                  |
| ----------------- | ------------------- |
| `./start.sh`      | macOS / Linux 一鍵啟動  |
| `start.bat`       | Windows 一鍵啟動        |
| `npm run setup`   | 執行自動化設定（.env、依賴、FFmpeg 偵測） |
| `npm start`       | 啟動服務                |
| `npm run dev`     | 以開發環境變數啟動           |
| `npm run check`   | 語法檢查                |
| `npm test`        | 執行測試套件              |
| `npm run test:ci` | 檢查 + 測試（用於 CI 或發版前） |

## 環境變數

| 變數                          | 用途                                     | 預設值                 |
| --------------------------- | -------------------------------------- | ------------------- |
| `PORT`                      | HTTP 監聽連接埠                             | `3000`              |
| `NODE_ENV`                  | 執行環境                                   | `development`       |
| `SESSION_SECRET`            | Session 簽名金鑰                           | —                   |
| `RESET_KEY`                 | 舊版全域重置金鑰（現已改為每使用者獨立金鑰儲存在資料庫中，此變數僅作相容保留） | —                   |
| `DB_PATH`                   | SQLite 檔案路徑                            | `./database.sqlite` |
| `CONTENT_ROOT`              | 媒體目錄根路徑                                | `./content`         |
| `TRUST_PROXY`               | 信任反向代理標頭                               | 生產環境預設 `1`          |
| `DEFAULT_ADMIN_USERNAME`    | 首次初始化管理員帳號                             | `admin`             |
| `DEFAULT_ADMIN_PASSWORD`    | 首次初始化管理員密碼                             | `admin`             |
| `IMAGE_PROCESS_CONCURRENCY` | 圖片處理並行數                                | 自動計算                |
| `SHARP_CONCURRENCY`         | Sharp 內部並行數                            | 自動計算                |
| `SHARP_CACHE_MEMORY_MB`     | Sharp 記憶體快取上限                           | `96`                |
| `FFMPEG_PATH`               | ffmpeg 可執行檔案路徑                         | 自動探測                |
| `FFPROBE_PATH`              | ffprobe 可執行檔案路徑                        | 自動探測                |
| `VIDEO_PROCESS_CONCURRENCY` | 影片處理並行數                                | `1`                 |
| `FFMPEG_THREADS`            | ffmpeg 執行緒數                             | `4`                 |
| `FFMPEG_PRESET`             | ffmpeg 編碼預設（已被系統設定頁面取代）                | `slow`              |
| `CDN_URL`                   | CDN 網域前綴，設定後媒體 URL 自動拼接                | 空（不啟用）              |

完整變數說明見 `.env.example`。

## 管理入口

| 路徑                | 說明                |
| ----------------- | ----------------- |
| `/admin/login`    | 後台登入              |
| `/admin/users`    | 使用者管理（僅 admin 可存取） |
| `/admin/settings` | 系統設定              |
| `/admin/visitors` | 存取統計              |
| `/passwd`         | 密碼重置              |
| `/health`         | 健康檢查              |
| `/ready`          | 就緒檢查              |

## 專案結構

```
.
├── content/                  # 站點媒體資源
│   └── images/
│       ├── original/
│       ├── large/
│       ├── medium/
│       ├── thumb/
│       └── video/
├── lib/                      # 後端核心模組
│   └── setup.js              # 自動化設定（.env、依賴、FFmpeg 偵測）
├── routes/                   # 公開站與後台路由
├── resources/                # 靜態前端資源（CSS、JS）
├── views/                    # EJS 模板與 partials
├── locales/                  # 多語言翻譯檔案
├── test/                     # 整合與單元測試
├── db.js                     # SQLite 初始化與 schema 遷移
├── config.js                 # 業務/內容設定管理
├── server.js                 # 應用入口
├── setup.js                  # CLI 設定入口
├── start.sh                  # macOS / Linux 一鍵啟動腳本
├── start.bat                 # Windows 一鍵啟動腳本
└── videoProcessor.js         # FFmpeg 影片處理
```

## 部署

### 生產環境檢查清單

- 使用反向代理（Nginx / Caddy），並設定 `TRUST_PROXY=true`
- 設定 SSL/TLS 證書，啟用 HTTPS（可使用 [Let's Encrypt](https://letsencrypt.org/) 免費取得）
- 使用程序管理器（PM2 / systemd），確保異常退出後自動重新啟動
- 修改 `.env` 中的 `SESSION_SECRET` 為高強度隨機值
- 首次登入後立即修改預設管理員密碼
- 定期備份：SQLite 資料庫、`content/` 目錄、`.env` 設定檔案

### PM2

```bash
pm2 start server.js --name art-media-publishing-site
pm2 save
pm2 startup
```

### systemd

```ini
[Unit]
Description=Art Media Publishing Site
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/var/www/art-media-publishing-site
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /var/www/art-media-publishing-site/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Nginx 反向代理

以下為 HTTP 範例，生產環境建議在 Nginx 層設定 HTTPS（可借助 `certbot` 自動管理證書）。

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 350m;
    }
}
```

## 已知邊界

- Session 持久化到 SQLite，多實例共享仍需額外方案
- 媒體儲存於本地檔案系統，雲端物件儲存需進一步抽象
- 影片處理依賴 `ffmpeg`/`ffprobe`，`npm install` 時會自動下載內建二進位；如系統已安裝也可直接使用，或透過 `FFMPEG_PATH`/`FFPROBE_PATH` 環境變數指定路徑
- 啟用 CDN 後，修改 Nginx 設定需手動重新整理 CDN 快取

## 授權條款

GPL-3.0

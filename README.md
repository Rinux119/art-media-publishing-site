# Art Media Publishing Site

[简体中文](README.md) | [繁體中文（香港）](README.zh-HK.md) | [繁體中文（臺灣）](README.zh-TW.md) | [日本語](README.ja.md) | [English](README.en.md)

## 关于这个项目

这是一个基于 Node.js、Express、SQLite 和 EJS 的作品展示与媒体发布平台。支持图片、视频、文字等多种形式，包含完整的后台发布工作流、图片变体生成和视频转码能力。

## 为什么会有这个项目

我是一名创作爱好者。

构建这个系统的初衷，起初是因为我自身对商业平台僵硬的展示方式（不是九宫格就是1:1）感到不满和束缚，同时也对于主流艺术界对“什么是艺术”这一定义的垄断，以及由此衍生出的对个人创作者的排挤感到无奈。

于是我通过 AI 的协助，构建了这个系统。起初这只是根据我个人的使用和展示习惯进行设计的东西，但我现在将其开源，希望各位同样苦于算法和学术垄断的个人创作者都能拥有属于自己的“白盒子”，解构“艺术作品必须依附于特定机构才能呈现”的叙事。

由于我本人并非科班出身的软件工程师，仅具备基本的服务器运维经验，所以我可能没有办法对当前系统进行进一步的优化或扩展。但我非常欢迎各位对此有需求或共鸣的朋友fork或使用这个项目，以满足自己的需求。

对于Issues，我会尽可能回复，但不能承诺能够解决。

对于PR，我会尽可能理解你提交的代码，但不能承诺能够接受，如果你能详细告知我做了什么改变，我会非常感谢。

## 特性

### 公开站点
- 首页展示、作品集列表、大图浏览、作品阐述展示
- Lightbox 大图查看：所有展示模式（single/diptych/wall/report）点击图片弹出 Lightbox 大图，支持左右切换、键盘导航（Esc 关闭、← → 切换）、点击遮罩关闭；双联画模式同时展示一对图片，移动端自动上下堆叠；底部展示作品阐述（Markdown 渲染）

### 后台管理
- 登录认证、用户管理、首页素材管理、作品集管理
- 媒体上传、排序、草稿与发布流程
- 区块化内容编辑：作品阐述区块与媒体管理区块独立展示，可折叠、可拖拽排序、可通过"上一层/下一层"按钮调整顺序；每个媒体区块可独立上传图片/视频

### 作品集可见性控制
| 开关        | 效果                                       |
| --------- | ---------------------------------------- |
| **隐藏入口**  | 作品集不在公开导航中显示                             |
| **禁止访问**  | 作品集 slug 页、大图页和相关 API 返回 404（自动联动启用隐藏入口） |
| **隐藏信息**  | 页脚隐藏完整站点信息                               |
| **显示简署名** | 仅在隐藏信息时生效；显示 `shortSignature` 文本         |

### 媒体处理
- **图片处理**：通过 Sharp 自动生成 `thumb`、`medium`、`large` 三种尺寸变体，并对原图进行压缩优化
- **视频转码**：通过 FFmpeg 自动转码为 H.264/AAC MP4 格式，分辨率压缩至 1080p，支持渐进式播放

### 系统设置
- 站点名称、署名、备案号、社交链接、图片/视频处理参数
- 均可在线修改，保存后立即生效，无需重启

### 多语言支持（i18n）
- **前台**：根据浏览器 `Accept-Language` 自动匹配语言（简体中文、繁体中文、英文、日文）
- **后台**：语言可在系统设置页面中手动指定

### 其他特性
- **CDN 加速**：配置 `CDN_URL` 后，媒体 URL 自动拼接 CDN 前缀
- **安全防护**：CSRF 防护、CSP/HSTS 安全头、IP 暴力破解锁定、自定义异常类
- **访问日志**：公开页面 IP/路径/时间戳自动记录，超限自动清理
- **Session 持久化**：Session 存储于 SQLite，服务重启后登录态不丢失
- **优雅关闭**：连接跟踪、健康/就绪检查、404/500 兜底
- **自动化测试**：77 个集成测试 + 11 个单元测试，覆盖核心工作流、安全防护与边界条件

## 运行要求

- Node.js `>= 18.17`
- npm `>= 9`
- FFmpeg 和 FFprobe

## 快速开始

### 一键启动（推荐）

macOS / Linux：
```bash
./start.sh
```

Windows：
```cmd
start.bat
```

启动脚本会自动完成以下操作：
1. 检测 Node.js 版本（如未安装则提示安装方式）
2. 自动创建 `.env`（从 `.env.example` 模板生成，含随机密钥）
3. 自动安装依赖（`npm install`）
4. 检测 FFmpeg/FFprobe 可用性
5. 启动服务

### 手动步骤

1. 安装依赖
```bash
npm install
```
2. 启动服务
```bash
npm start        # 生产环境
npm run dev      # 开发环境
```

> `.env` 文件会在首次启动时自动从 `.env.example` 创建并生成随机密钥，无需手动复制。

默认监听 `http://localhost:3000`

管理后台登录地址 `http://localhost:3000/admin/login`

默认管理员账号密码 `admin` / `admin`

## 常用脚本

| 命令                | 说明                  |
| ----------------- | ------------------- |
| `./start.sh`      | macOS / Linux 一键启动  |
| `start.bat`       | Windows 一键启动        |
| `npm run setup`   | 运行自动化设置（.env、依赖、FFmpeg 检测） |
| `npm start`       | 启动服务                |
| `npm run dev`     | 以开发环境变量启动           |
| `npm run check`   | 语法检查                |
| `npm test`        | 运行测试套件              |
| `npm run test:ci` | 检查 + 测试（用于 CI 或发版前） |

## 环境变量

| 变量                          | 用途                                     | 默认值                 |
| --------------------------- | -------------------------------------- | ------------------- |
| `PORT`                      | HTTP 监听端口                              | `3000`              |
| `NODE_ENV`                  | 运行环境                                   | `development`       |
| `SESSION_SECRET`            | Session 签名密钥                           | —                   |
| `RESET_KEY`                 | 旧版全局重置密钥（现已改为每用户独立密钥存储在数据库中，此变量仅作兼容保留） | —                   |
| `DB_PATH`                   | SQLite 文件路径                            | `./database.sqlite` |
| `CONTENT_ROOT`              | 媒体目录根路径                                | `./content`         |
| `TRUST_PROXY`               | 信任反向代理头                                | 生产环境默认 `1`          |
| `DEFAULT_ADMIN_USERNAME`    | 首次初始化管理员账号                             | `admin`             |
| `DEFAULT_ADMIN_PASSWORD`    | 首次初始化管理员密码                             | `admin`             |
| `IMAGE_PROCESS_CONCURRENCY` | 图片处理并发数                                | 自动计算                |
| `SHARP_CONCURRENCY`         | Sharp 内部并发数                            | 自动计算                |
| `SHARP_CACHE_MEMORY_MB`     | Sharp 内存缓存上限                           | `96`                |
| `FFMPEG_PATH`               | ffmpeg 可执行文件路径                         | 自动探测                |
| `FFPROBE_PATH`              | ffprobe 可执行文件路径                        | 自动探测                |
| `VIDEO_PROCESS_CONCURRENCY` | 视频处理并发数                                | `1`                 |
| `FFMPEG_THREADS`            | ffmpeg 线程数                             | `4`                 |
| `FFMPEG_PRESET`             | ffmpeg 编码预设（已被系统设置页面取代）                | `slow`              |
| `CDN_URL`                   | CDN 域名前缀，设置后媒体 URL 自动拼接                | 空（不启用）              |

完整变量说明见 `.env.example`。

## 管理入口

| 路径                | 说明                |
| ----------------- | ----------------- |
| `/admin/login`    | 后台登录              |
| `/admin/users`    | 用户管理（仅 admin 可访问） |
| `/admin/settings` | 系统设置              |
| `/admin/visitors` | 访问统计              |
| `/passwd`         | 密码重置              |
| `/health`         | 健康检查              |
| `/ready`          | 就绪检查              |

## 项目结构

```
.
├── content/                  # 站点媒体资源
│   └── images/
│       ├── original/
│       ├── large/
│       ├── medium/
│       ├── thumb/
│       └── video/
├── lib/                      # 后端核心模块
│   └── setup.js              # 自动化设置（.env、依赖、FFmpeg 检测）
├── routes/                   # 公开站与后台路由
├── resources/                # 静态前端资源（CSS、JS）
│   ├── js/
│   │   ├── lightbox.js       # Lightbox 大图查看交互逻辑
│   │   └── ...
│   ├── lightbox.css           # Lightbox 大图查看样式
│   └── ...
├── views/                    # EJS 模板与 partials
├── locales/                  # 多语言翻译文件
├── test/                     # 集成与单元测试
├── db.js                     # SQLite 初始化与 schema 迁移
├── config.js                 # 业务/内容配置管理
├── server.js                 # 应用入口
├── setup.js                  # CLI 设置入口
├── start.sh                  # macOS / Linux 一键启动脚本
├── start.bat                 # Windows 一键启动脚本
└── videoProcessor.js         # FFmpeg 视频处理
```

## 部署

### 生产环境检查清单

- 使用反向代理（Nginx / Caddy），并设置 `TRUST_PROXY=true`
- 配置 SSL/TLS 证书，启用 HTTPS（可使用 [Let's Encrypt](https://letsencrypt.org/) 免费获取）
- 使用进程管理器（PM2 / systemd），确保异常退出后自动拉起
- 修改 `.env` 中的 `SESSION_SECRET` 为高强度随机值
- 首次登录后立即修改默认管理员密码
- 定期备份：SQLite 数据库、`content/` 目录、`.env` 配置文件

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

以下为 HTTP 示例，生产环境建议在 Nginx 层配置 HTTPS（可借助 `certbot` 自动管理证书）。

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

## 已知边界

- Session 持久化到 SQLite，多实例共享仍需额外方案
- 媒体存储于本地文件系统，云对象存储需进一步抽象
- 视频处理依赖 `ffmpeg`/`ffprobe`，`npm install` 时会自动下载内置二进制；如系统已安装也可直接使用，或通过 `FFMPEG_PATH`/`FFPROBE_PATH` 环境变量指定路径
- 启用 CDN 后，修改 Nginx 配置需手动刷新 CDN 缓存

## 许可证

GPL-3.0

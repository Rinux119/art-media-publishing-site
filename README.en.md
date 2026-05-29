# Art Media Publishing Site

[简体中文](README.md) | [繁體中文（香港）](README.zh-HK.md) | [繁體中文（臺灣）](README.zh-TW.md) | [日本語](README.ja.md) | [English](README.en.md)

## About This Project

A self-hosted art portfolio and media publishing platform built with Node.js, Express, SQLite, and EJS. Supports photos, videos, text, and more — with a full admin workflow for publishing, image variant generation, and video transcoding.

## Why This Project Exists

I am a creative hobbyist.

The original motivation for building this system was my frustration with the rigid display formats of commercial platforms (nothing but 3x3 image grids or 1:1 crops), and my disillusionment with the mainstream art world's monopoly on defining "what counts as art" — and the resulting marginalization of independent creators.

So with the help of AI, I built this system. It was initially designed around my own usage and display preferences, but I'm now open-sourcing it in the hope that fellow creators who are similarly constrained by algorithms and institutional gatekeeping can have their own "white cube" — dismantling the narrative that "art must be presented through established institutions to be valid."

I'm not a formally trained software engineer — I only have basic server operations experience — so I may not be able to further optimize or extend this system. But I warmly welcome anyone with similar needs or sentiments to fork or use this project for their own purposes.

For Issues, I'll do my best to respond, but I can't promise to resolve them.

For PRs, I'll do my best to understand the code you submit, but I can't promise to accept it. If you can clearly explain what changes you've made, I'd be very grateful.

## Features

### Public Site
- Homepage, collection list, full-size image viewer, artwork description

### Admin Dashboard
- Login authentication, user management, homepage media management, collection management
- Media upload, sorting, draft/publish workflow

### Collection Visibility Controls
| Toggle | Effect |
|--------|--------|
| **Hide entry** | Collection not shown in public navigation |
| **Block access** | Collection slug, full-size pages, and APIs return 404 (auto-enables hide entry) |
| **Hide info** | Footer hides full site info |
| **Show short signature** | Only when info is hidden; shows `shortSignature` text |

### Media Processing
- **Image processing**: automatic `thumb`, `medium`, `large` variant generation and original compression via Sharp
- **Video transcoding**: automatic H.264/AAC MP4 encoding via FFmpeg, compressed to 1080p with progressive playback support

### System Settings
- Site name, signature, ICP filing number, social links, image/video processing parameters
- All editable online with immediate effect, no restart required

### Internationalization (i18n)
- **Frontend**: automatic language matching (Simplified Chinese, Traditional Chinese, English, Japanese) based on browser `Accept-Language`
- **Admin**: language configurable in system settings

### Other Features
- **CDN support**: media URLs automatically prefixed with `CDN_URL` when configured
- **Security**: CSRF protection, CSP/HSTS headers, IP-based brute-force lockout, custom exception classes
- **Visit logging**: public page IP/path/timestamp recording with auto-cleanup
- **Session persistence**: sessions stored in SQLite, survive server restarts
- **Graceful shutdown**: connection tracking, health/readiness checks, 404/500 fallbacks
- **Automated tests**: 77 integration tests + 11 unit tests covering core workflows, security, and edge cases

## Requirements

- Node.js `>= 18.17`
- npm `>= 9`
- FFmpeg and FFprobe: binaries are automatically downloaded during `npm install` (via `ffmpeg-static` and `@ffprobe-installer/ffprobe`); no manual installation needed. To use a system-installed version, set `FFMPEG_PATH` / `FFPROBE_PATH` environment variables

## Quick Start

### One-Click Launch (Recommended)

macOS / Linux:
```bash
./start.sh
```

Windows:
```cmd
start.bat
```

The launch script automatically:
1. Checks Node.js version (prompts installation if missing)
2. Creates `.env` from `.env.example` with random secrets
3. Installs dependencies (`npm install`)
4. Detects FFmpeg/FFprobe availability
5. Starts the server

### Manual Steps

1. Install dependencies
```bash
npm install
```
2. Start the server
```bash
npm start        # production
npm run dev      # development
```

> The `.env` file is automatically created from `.env.example` with random secrets on first launch — no manual copy needed.

Default: `http://localhost:3000`

Admin dashboard login: `http://localhost:3000/admin/login`

Default admin credentials: `admin` / `admin`

## Common Scripts

| Command | Description |
|---------|-------------|
| `./start.sh` | One-click launch (macOS / Linux) |
| `start.bat` | One-click launch (Windows) |
| `npm run setup` | Run automated setup (.env, dependencies, FFmpeg detection) |
| `npm start` | Start server |
| `npm run dev` | Start with development env |
| `npm run check` | Syntax check |
| `npm test` | Run test suite |
| `npm run test:ci` | Check + test (for CI / pre-release) |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SESSION_SECRET` | Session signing key | — |
| `RESET_KEY` | Legacy reset key (per-user keys now in DB, this variable is kept for compatibility only) | — |
| `DB_PATH` | SQLite file path | `./database.sqlite` |
| `CONTENT_ROOT` | Media directory root | `./content` |
| `TRUST_PROXY` | Trust reverse proxy headers | `1` in production |
| `DEFAULT_ADMIN_USERNAME` | Initial admin username | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password | `admin` |
| `IMAGE_PROCESS_CONCURRENCY` | Image processing concurrency | auto |
| `SHARP_CONCURRENCY` | Sharp internal concurrency | auto |
| `SHARP_CACHE_MEMORY_MB` | Sharp cache limit | `96` |
| `FFMPEG_PATH` | ffmpeg binary path | auto-detect |
| `FFPROBE_PATH` | ffprobe binary path | auto-detect |
| `VIDEO_PROCESS_CONCURRENCY` | Video processing concurrency | `1` |
| `FFMPEG_THREADS` | ffmpeg thread count | `4` |
| `FFMPEG_PRESET` | ffmpeg encoding preset (superseded by settings page) | `slow` |
| `CDN_URL` | CDN domain prefix for media URLs | empty (disabled) |

Full list in `.env.example`.

## Admin Endpoints

| Path | Description |
|------|-------------|
| `/admin/login` | Admin login |
| `/admin/users` | User management (admin only) |
| `/admin/settings` | System settings |
| `/admin/visitors` | Visit statistics |
| `/passwd` | Password reset |
| `/health` | Health check |
| `/ready` | Readiness check |

## Project Structure

```
.
├── content/                  # Site media assets
│   └── images/
│       ├── original/
│       ├── large/
│       ├── medium/
│       ├── thumb/
│       └── video/
├── lib/                      # Backend modules
│   └── setup.js              # Automated setup (.env, dependencies, FFmpeg detection)
├── routes/                   # Public and admin routes
├── resources/                # Static frontend assets (CSS, JS)
├── views/                    # EJS templates and partials
├── locales/                  # i18n translation files
├── test/                     # Integration and unit tests
├── db.js                     # SQLite init and schema migration
├── config.js                 # Business/content config management
├── server.js                 # App entry point
├── setup.js                  # CLI setup entry point
├── start.sh                  # macOS / Linux one-click launch script
├── start.bat                 # Windows one-click launch script
└── videoProcessor.js         # FFmpeg video processing
```

## Deployment

### Production Checklist

- Use a reverse proxy (Nginx / Caddy) with `TRUST_PROXY=true`
- Configure SSL/TLS certificates and enable HTTPS (free certificates available via [Let's Encrypt](https://letsencrypt.org/))
- Use a process manager (PM2 / systemd) for auto-restart
- Set `SESSION_SECRET` in `.env` to a strong random value
- Change default admin password immediately after first login
- Regularly back up: SQLite database, `content/` directory, `.env` config file

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

### Nginx Reverse Proxy

The example below uses HTTP. For production, configure HTTPS at the Nginx layer (you can use `certbot` to auto-manage certificates).

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

## Known Limitations

- Sessions persist to SQLite; multi-instance sharing requires additional setup
- Media stored on local filesystem; cloud object storage requires further abstraction
- Video processing depends on `ffmpeg`/`ffprobe`; binaries are automatically downloaded during `npm install`. System-installed versions also work, or specify paths via `FFMPEG_PATH`/`FFPROBE_PATH`
- CDN cache must be manually refreshed after Nginx config changes

## License

GPL-3.0

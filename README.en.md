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
- Lightbox viewer: all display modes (single/diptych/wall/report/anthology/archiving) open a Lightbox overlay on click instead of navigating to a new page; supports left/right navigation, keyboard controls (Esc to close, ← → to switch), and click-to-dismiss; diptych mode shows both images side by side (stacked vertically on mobile); artwork description rendered as Markdown at the bottom
- Fifth display mode "anthology": the collection homepage shows a Grid of anthology entries (each media block corresponds to one anthology, with the first image of the block as its thumbnail); clicking an entry opens that anthology's thumbnail page; each anthology supports an independent title shown beneath its thumbnail; Grid layout uses a "Contact Printing" style with fixed-ratio cells
- Sixth display mode "Archiving": Similar to Anthology supporting multiple media blocks and statement blocks, but the first-level page displays a title list (not a thumbnail grid); titles come from the "Anthology Title" of media blocks and the "Document Title" of statement blocks; clicking a title enters the second-level page for that block, with a "Go back" link at the bottom
- Selectable "Format/Display Mode" for anthology and archiving: media blocks support film aspect ratios (3:2/135, 2:3/Half, 2.7:1/X-Pan, 4:3/6x4.5, 1:1/6x6, 1.16:1/6x7, 1.37:1/6x8, 2.25:1/6x12, 3:1/6x17, 5:4/4x5) and display modes (single, diptych, wall, report); the sub-page (`/:slug/:blockId`) and full-size page (`/:slug/:filename_large?block=:id`) now render per the block-level display mode, while aspect ratios only affect cell proportions and portrait rotation under the single display mode; other display types are fixed to their corresponding display mode and unselectable

### Admin Dashboard
- Login authentication, user management, homepage media management, collection management
- Media upload, sorting, draft/publish workflow
- Artist statement text boxes support direct image/video upload: uploaded files are saved to `content/media_library/`, processed via sharp/ffmpeg, and Markdown references are auto-inserted at the cursor; files not referenced by any text box are automatically cleaned up
- Block-based content editing: artist statement blocks and media management blocks displayed independently, collapsible, draggable for reordering, adjustable via "Move Up/Move Down" buttons; each media block supports independent image/video upload
- Unified config panel layout for media and text blocks: both use a three-section structure of "config panel (title + format/display mode + upload area) → main editing area → bottom action bar"; text block format/display mode is fixed to "Unavailable in text mode" and disabled; "Save Text" button aligns with the media block's "Save Order" button

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
- **Automated tests**: 91 integration tests + 11 unit tests covering core workflows, security, and edge cases, including anthology / archiving sub-page routing and block-level `media_format` rendering

## Collection Display Style Guide

The system provides six collection display styles. They fall into two groups:

- **Direct display**: Single, Diptych, Wall, and Report
- **Hierarchical display**: Anthology and Archiving

### Quick Selection

| Style | What it does | Recommended for |
| --- | --- | --- |
| **Single** | Preserves media proportions in a spaced waterfall layout | General photography, painting, and illustration portfolios |
| **Diptych** | Pairs every two media items according to their order | Contrast, correspondence, before/after relationships, and paired work |
| **Wall** | Displays multiple columns continuously without gaps | Large series where density and overall atmosphere matter |
| **Report** | Combines image galleries and text blocks | Project records, exhibition reports, and research-based work |
| **Anthology** | Shows a cover grid first, then opens individual series | Collections containing several visual series |
| **Archiving** | Shows a title list first, then opens individual content | Yearly archives, documents, manuscripts, and project materials |

When in doubt:

- No special structure: choose **Single**
- Two works must be viewed together: choose **Diptych**
- A large number of images should create one dense visual field: choose **Wall**
- Images need accompanying explanation: choose **Report**
- Several series need to be introduced by cover images: choose **Anthology**
- Content should be found by title, year, or document name: choose **Archiving**

### The Six Styles

#### 1. Single

Each work is displayed independently, preserving its original aspect ratio in a spaced multi-column waterfall layout. Large screens normally use three columns, medium screens two, and phones one.

This is the general-purpose option for work without a defined pairing relationship. “Single” does not mean that a page can contain only one image.

#### 2. Diptych

Media are paired automatically according to their order in the admin panel: items 1 and 2 form a pair, then items 3 and 4, and so on. If the total is odd, the final item is displayed alone.

The full-size viewer also treats each pair as one unit and stacks the two images vertically on mobile. Decide the pairs before arranging the media order; inserting or moving one item can change every following pair.

#### 3. Wall

Images are placed in continuous columns with no gaps. Large screens normally use four columns, medium screens three or two, and phones one. Videos autoplay silently in the wall.

Wall emphasizes rhythm, density, and the overall visual field. It is less suitable for large amounts of whitespace, item-by-item reading, or strict pairing.

#### 4. Report

Image and text blocks can be combined into a sequence such as “Project introduction → Image group → Process → Image group → Conclusion”. Small galleries use a column count based on the number of images; larger galleries normally show square thumbnails before opening the full-size view.

Text blocks support Markdown. Images and videos can also be uploaded directly and inserted into the text. Report is suited to exhibition records, research processes, residencies, performance work, and any project that needs context.

#### 5. Anthology

Anthology uses two levels. The first-level page shows multiple cover entries; clicking a cover opens its corresponding sub-series. Each media block represents one sub-series:

- The first media item in the block becomes its cover
- The “Anthology Title” appears below the cover
- A block with no media does not become an entry
- Text blocks are not cover entries; they appear after the cover grid on the anthology homepage

Give each media block a title and place the intended cover image first.

#### 6. Archiving

Archiving also uses two levels, but the first-level page shows a title list rather than covers. Media blocks use “Anthology Title”; text blocks use “Document Title”. Both can become entries, but untitled blocks are omitted from the list.

Use Archiving for content organized by year, project, medium, or document name. The key difference is: **Anthology is navigated by covers; Archiving is navigated by titles.**

### Block Settings for Anthology and Archiving

Only Anthology and Archiving allow each media block to have its own “Format/Display Mode”. This is a block-level setting, separate from the collection type.

Display modes are: Single, Diptych, Wall, and Report.

Available aspect ratios are: `3:2 (135)`, `2:3 (Half)`, `2.7:1 (X-Pan)`, `4:3 (6x4.5)`, `1:1 (6x6)`, `1.16:1 (6x7)`, `1.37:1 (6x8)`, `2.25:1 (6x12)`, `3:1 (6x17)`, and `5:4 (4x5)`.

Choosing a display mode renders the sub-page with that layout. Choosing an aspect ratio renders the sub-page as a contact-print-style grid with uniform cell proportions. If an image orientation does not match the selected format, the system may rotate the image automatically.

### Creating and Publishing from the Admin Panel

1. Add a collection with a name, Slug, and collection type. New collections start with their entry hidden.
2. Open “Media Management”. An image block and a text block are created automatically.
3. Upload images or videos to the media block and drag to arrange their order. Newly uploaded media is placed at the beginning of the block.
4. Edit the text block. Markdown is supported, and media can be uploaded and inserted into the text.
5. For Anthology or Archiving, title each block and set the media block’s aspect ratio or display mode.
6. Drag blocks, or use “Move Up/Move Down”, to adjust the page order.
7. Click “Publish Updates” to send media, text, titles, formats, and ordering to the public site.
8. Check the page at `/<slug>`. When it is ready, enable “Show Entry” on the collection card.

Single, Diptych, and Wall normally use one media block. Report, Anthology, and Archiving can use multiple media blocks. All collection types can use multiple text blocks.

### Publishing, Access, and Full-Size Viewing

- **Hide entry**: The collection is removed from public navigation, but remains accessible to anyone who knows its URL.
- **Block access**: The collection URL, full-size pages, and related APIs return 404, stopping external access.
- **Publish Updates**: Media, text, block titles, formats, and ordering appear publicly only after publishing.
- **Changing the collection type**: Type changes affect the public page immediately and do not use the collection’s draft publishing step.

Changing an existing collection type does not delete its content, but its block structure may no longer fit the new style. Always check the public page after switching, especially when moving between Anthology, Archiving, Report, Single, Diptych, and Wall.

All direct-display pages and Anthology/Archiving sub-pages support clicking a work to open the Lightbox. Use the previous/next buttons or arrow keys to navigate, `Esc` to close, and click the overlay to return. Artwork descriptions appear below the full-size media.

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

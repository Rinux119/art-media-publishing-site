# Art Media Publishing Site

[简体中文](README.md) | [繁體中文（香港）](README.zh-HK.md) | [繁體中文（臺灣）](README.zh-TW.md) | [日本語](README.ja.md) | [English](README.en.md)

## このプロジェクトについて

Node.js、Express、SQLite、EJS で構築された作品展示・メディア公開プラットフォームです。写真、動画、テキストなど多様な形式に対応し、管理画面からの公開ワークフロー、画像バリアント生成、動画トランスコード機能を備えています。

## なぜこのプロジェクトを作ったのか

私は創作愛好家です。

このシステムを作ったきっかけは、商用プラットフォームの硬直的な表示方式（3x3のグリッドか1:1しか選べない）に対する不満と束縛感、そして主流のアート界が「何がアートか」という定義を独占し、そこから派生する個人クリエイターへの排除に対する無念さでした。

そこで私は AI の支援を受け、このシステムを構築しました。当初は私個人の使用と表示習慣に基づいて設計されたものでしたが、今ではオープンソースとして公開します。アルゴリズムと学術的独占に苦しむ個人クリエイターが、自分だけの「ホワイトキューブ」を持ち、「芸術作品は特定の機関に依存しなければ展示できない」という物語を解体できることを願っています。

私は正規のソフトウェアエンジニアではなく、基本的なサーバー運用経験しか持っていないため、現在のシステムをさらに最適化・拡張することはできないかもしれません。しかし、このプロジェクトにニーズや共感を持つ方が fork または利用して、自分のニーズを満たすことを大いに歓迎します。

Issues については、できる限り返信しますが、解決を約束することはできません。

PR については、提出されたコードをできる限り理解するよう努めますが、受け入れることを約束することはできません。どのような変更をしたかを詳しく教えていただければ、非常に感謝します。

## 特徴

### 公開サイト
- ホームページ、コレクション一覧、拡大画像ビューア、作品解説表示
- Lightbox 表示：すべての表示モード（single/diptych/wall/report）で画像クリック時に Lightbox オーバーレイで拡大表示（新ページ遷移なし）；左右ナビゲーション、キーボード操作（Esc で閉じる、← → で切替）、オーバーレイクリックで閉じる；diptych モードではペア画像を並べて表示（モバイルでは縦積み）；下部に作品解説を Markdown レンダリング

### 管理画面
- ログイン認証、ユーザー管理、ホームページ素材管理、コレクション管理
- メディアアップロード、並べ替え、下書き・公開ワークフロー

### コレクション表示制御
| スイッチ        | 効果                                              |
| ----------- | ----------------------------------------------- |
| **エントリ非表示** | コレクションが公開ナビゲーションに表示されない                         |
| **アクセスブロック** | コレクションの slug ページ、拡大画像ページ、関連 API が 404 を返す（エントリ非表示が自動連動） |
| **情報非表示**   | フッターの完全なサイト情報を非表示                               |
| **短い署名表示**  | 情報非表示の時のみ有効；`shortSignature` テキストを表示            |

### メディア処理
- **画像処理**：Sharp による `thumb`、`medium`、`large` バリアントの自動生成、およびオリジナル画像の圧縮最適化
- **動画トランスコード**：FFmpeg による H.264/AAC MP4 自動トランスコード、1080p に圧縮、プログレッシブ再生対応

### システム設定
- サイト名、署名、ICP番号、ソーシャルリンク、画像/動画処理パラメータ
- すべてオンラインで変更可能、保存後すぐに反映、再起動不要

### 多言語対応（i18n）
- **フロント**：ブラウザの `Accept-Language` に基づいて自動的に言語をマッチング（簡体字中国語、繁体字中国語、英語、日本語）
- **管理画面**：システム設定で言語を指定可能

### その他の特徴
- **CDN サポート**：`CDN_URL` を設定すると、メディア URL に CDN プレフィックスが自動付与
- **セキュリティ**：CSRF 保護、CSP/HSTS ヘッダー、IP ベースのブルートフォースロックアウト、カスタム例外クラス
- **アクセスログ**：公開ページの IP/パス/タイムスタンプを自動記録、上限超過で自動クリーンアップ
- **セッション永続化**：セッションは SQLite に保存、サーバー再起動後もログイン状態を維持
- **グレースフルシャットダウン**：接続追跡、ヘルス/レディネスチェック、404/500 フォールバック
- **自動テスト**：77 の統合テスト + 11 のユニットテスト、コアワークフロー、セキュリティ、エッジケースをカバー

## 動作要件

- Node.js `>= 18.17`
- npm `>= 9`
- FFmpeg と FFprobe：`npm install` 時に自動でバイナリがダウンロードされます（`ffmpeg-static` と `@ffprobe-installer/ffprobe` 経由）。手動インストールは不要です。システムにインストール済みのバージョンを使用する場合は、`FFMPEG_PATH` / `FFPROBE_PATH` 環境変数で指定できます

## クイックスタート

### ワンクリック起動（推奨）

macOS / Linux：
```bash
./start.sh
```

Windows：
```cmd
start.bat
```

起動スクリプトは以下の操作を自動で行います：
1. Node.js バージョンの確認（未インストール時はインストール方法を案内）
2. `.env` の自動作成（`.env.example` テンプレートから生成、ランダムシークレット付き）
3. 依存関係の自動インストール（`npm install`）
4. FFmpeg/FFprobe の利用可能性を検出
5. サーバーの起動

### 手動手順

1. 依存関係のインストール
```bash
npm install
```
2. サーバーの起動
```bash
npm start        # 本番環境
npm run dev      # 開発環境
```

> `.env` ファイルは初回起動時に `.env.example` から自動作成され、ランダムシークレットが生成されるため、手動コピーは不要です。

デフォルト：`http://localhost:3000`

管理画面ログイン：`http://localhost:3000/admin/login`

デフォルト管理者アカウント：`admin` / `admin`

## よく使うスクリプト

| コマンド              | 説明                    |
| ----------------- | --------------------- |
| `./start.sh`      | ワンクリック起動（macOS / Linux） |
| `start.bat`       | ワンクリック起動（Windows）      |
| `npm run setup`   | 自動セットアップの実行（.env、依存関係、FFmpeg 検出） |
| `npm start`       | サーバー起動                |
| `npm run dev`     | 開発環境変数で起動             |
| `npm run check`   | 構文チェック                |
| `npm test`        | テストスイートの実行            |
| `npm run test:ci` | チェック + テスト（CI またはリリース前） |

## 環境変数

| 変数                          | 用途                                         | デフォルト               |
| --------------------------- | ------------------------------------------ | ------------------- |
| `PORT`                      | HTTP リスニングポート                              | `3000`              |
| `NODE_ENV`                  | 実行環境                                       | `development`       |
| `SESSION_SECRET`            | セッション署名キー                                  | —                   |
| `RESET_KEY`                 | 旧版グローバルリセットキー（現在はユーザーごとの独立キーをDBに保存、この変数は互換用） | —                   |
| `DB_PATH`                   | SQLite ファイルパス                              | `./database.sqlite` |
| `CONTENT_ROOT`              | メディアディレクトリのルートパス                           | `./content`         |
| `TRUST_PROXY`               | リバースプロシヘッダーを信頼                             | 本番環境でデフォルト `1`      |
| `DEFAULT_ADMIN_USERNAME`    | 初期管理者アカウント                                 | `admin`             |
| `DEFAULT_ADMIN_PASSWORD`    | 初期管理者パスワード                                 | `admin`             |
| `IMAGE_PROCESS_CONCURRENCY` | 画像処理の並行数                                   | 自動計算                |
| `SHARP_CONCURRENCY`         | Sharp 内部並行数                                | 自動計算                |
| `SHARP_CACHE_MEMORY_MB`     | Sharp メモリキャッシュ上限                           | `96`                |
| `FFMPEG_PATH`               | ffmpeg バイナリパス                              | 自動検出                |
| `FFPROBE_PATH`              | ffprobe バイナリパス                             | 自動検出                |
| `VIDEO_PROCESS_CONCURRENCY` | 動画処理の並行数                                   | `1`                 |
| `FFMPEG_THREADS`            | ffmpeg スレッド数                               | `4`                 |
| `FFMPEG_PRESET`             | ffmpeg エンコードプリセット（システム設定ページに置き換え済み）        | `slow`              |
| `CDN_URL`                   | CDN ドメインプレフィックス、設定するとメディア URL に自動付与        | 空（無効）               |

完全な変数説明は `.env.example` を参照してください。

## 管理エンドポイント

| パス                | 説明                |
| ----------------- | ----------------- |
| `/admin/login`    | 管理画面ログイン          |
| `/admin/users`    | ユーザー管理（admin のみ）  |
| `/admin/settings` | システム設定            |
| `/admin/visitors` | アクセス統計            |
| `/passwd`         | パスワードリセット         |
| `/health`         | ヘルスチェック           |
| `/ready`          | レディネスチェック         |

## プロジェクト構成

```
.
├── content/                  # サイトメディアアセット
│   └── images/
│       ├── original/
│       ├── large/
│       ├── medium/
│       ├── thumb/
│       └── video/
├── lib/                      # バックエンドコアモジュール
│   └── setup.js              # 自動セットアップ（.env、依存関係、FFmpeg 検出）
├── routes/                   # 公開・管理ルート
├── resources/                # 静的フロントエンドアセット（CSS、JS）
├── views/                    # EJS テンプレートと partials
├── locales/                  # 多言語翻訳ファイル
├── test/                     # 統合・ユニットテスト
├── db.js                     # SQLite 初期化と schema マイグレーション
├── config.js                 # ビジネス/コンテンツ設定管理
├── server.js                 # アプリケーションエントリポイント
├── setup.js                  # CLI セットアップエントリポイント
├── start.sh                  # macOS / Linux ワンクリック起動スクリプト
├── start.bat                 # Windows ワンクリック起動スクリプト
└── videoProcessor.js         # FFmpeg 動画処理
```

## デプロイ

### 本番環境チェックリスト

- リバースプロキシ（Nginx / Caddy）を使用し、`TRUST_PROXY=true` を設定
- SSL/TLS 証明書を設定し、HTTPS を有効化（[Let's Encrypt](https://letsencrypt.org/) で無料取得可能）
- プロセスマネージャー（PM2 / systemd）を使用し、異常終了後の自動再起動を確保
- `.env` の `SESSION_SECRET` を強力なランダム値に変更
- 初回ログイン後、デフォルトの管理者パスワードを直ちに変更
- 定期的なバックアップ：SQLite データベース、`content/` ディレクトリ、`.env` 設定ファイル

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

### Nginx リバースプロキシ

以下は HTTP の例です。本番環境では Nginx 側で HTTPS を設定してください（`certbot` で証明書を自動管理できます）。

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

## 既知の制限

- セッションは SQLite に永続化、マルチインスタンス共有には追加の対応が必要
- メディアはローカルファイルシステムに保存、クラウドオブジェクトストレージにはさらなる抽象化が必要
- 動画処理は `ffmpeg`/`ffprobe` に依存、`npm install` 時にバイナリが自動ダウンロードされます。システムにインストール済みのバージョンも使用可能、または `FFMPEG_PATH`/`FFPROBE_PATH` 環境変数でパスを指定
- CDN 有効化後、Nginx 設定の変更時は CDN キャッシュの手動リフレッシュが必要

## ライセンス

GPL-3.0

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const { loadEnvFiles, resolveContentRoot } = require('./lib/runtime-config');

loadEnvFiles({ baseDir: __dirname });

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'database.sqlite');

fs.ensureDirSync(path.dirname(dbPath));
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS passwd_reset_ip_lockouts (
    ip TEXT PRIMARY KEY,
    failed_key_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_passwd_reset_ip_lockouts_locked_until
    ON passwd_reset_ip_lockouts(locked_until);

  CREATE TABLE IF NOT EXISTS admin_login_lockouts (
    username TEXT PRIMARY KEY,
    failed_password_count INTEGER NOT NULL DEFAULT 0,
    locked_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_login_lockouts_locked_at
    ON admin_login_lockouts(locked_at);

  CREATE TABLE IF NOT EXISTS admin_login_ip_lockouts (
    ip TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admin_login_ip_lockouts_locked_until
    ON admin_login_ip_lockouts(locked_until);

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS visit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    path TEXT NOT NULL,
    user_agent TEXT,
    visited_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at
    ON visit_logs(visited_at);

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    slug TEXT UNIQUE,
    display_type TEXT NOT NULL DEFAULT 'single',
    report_markdown TEXT NOT NULL DEFAULT '',
    published_report_markdown TEXT NOT NULL DEFAULT '',
    order_index INTEGER DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    hide_info INTEGER NOT NULL DEFAULT 0,
    show_credit INTEGER NOT NULL DEFAULT 0,
    access_blocked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER,
    filename TEXT,
    original_name TEXT,
    report_markdown TEXT NOT NULL DEFAULT '',
    order_index INTEGER DEFAULT 0,
    published_filename TEXT,
    published_original_name TEXT,
    published_report_markdown TEXT NOT NULL DEFAULT '',
    published_order_index INTEGER DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 0,
    is_deleted_draft INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    UNIQUE(collection_id, filename)
  );

`);

const userColumns = db.prepare("PRAGMA table_info('users')").all();
if (!userColumns.some((col) => col.name === 'reset_key_hash')) {
    db.exec("ALTER TABLE users ADD COLUMN reset_key_hash TEXT DEFAULT NULL");
}

const collectionColumns = db.prepare("PRAGMA table_info('collections')").all();
if (!collectionColumns.some((col) => col.name === 'display_type')) {
    db.exec("ALTER TABLE collections ADD COLUMN display_type TEXT NOT NULL DEFAULT 'single'");
}
db.exec("UPDATE collections SET display_type = 'single' WHERE display_type IS NULL OR display_type = ''");

if (!collectionColumns.some((col) => col.name === 'report_markdown')) {
    db.exec("ALTER TABLE collections ADD COLUMN report_markdown TEXT NOT NULL DEFAULT ''");
}
db.exec("UPDATE collections SET report_markdown = '' WHERE report_markdown IS NULL");

let needsCollectionPublishedReportBootstrap = false;
if (!collectionColumns.some((col) => col.name === 'published_report_markdown')) {
    db.exec("ALTER TABLE collections ADD COLUMN published_report_markdown TEXT NOT NULL DEFAULT ''");
    needsCollectionPublishedReportBootstrap = true;
}
if (needsCollectionPublishedReportBootstrap) {
    db.exec("UPDATE collections SET published_report_markdown = report_markdown");
}

if (!collectionColumns.some((col) => col.name === 'is_hidden')) {
    db.exec("ALTER TABLE collections ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0");
}
db.exec("UPDATE collections SET is_hidden = 0 WHERE is_hidden IS NULL");

if (!collectionColumns.some((col) => col.name === 'hide_info')) {
    db.exec("ALTER TABLE collections ADD COLUMN hide_info INTEGER NOT NULL DEFAULT 0");
}
db.exec("UPDATE collections SET hide_info = 0 WHERE hide_info IS NULL");

if (!collectionColumns.some((col) => col.name === 'show_credit')) {
    db.exec("ALTER TABLE collections ADD COLUMN show_credit INTEGER NOT NULL DEFAULT 0");
}
db.exec("UPDATE collections SET show_credit = 0 WHERE show_credit IS NULL");

if (!collectionColumns.some((col) => col.name === 'access_blocked')) {
    db.exec("ALTER TABLE collections ADD COLUMN access_blocked INTEGER NOT NULL DEFAULT 0");
}
db.exec("UPDATE collections SET access_blocked = 0 WHERE access_blocked IS NULL");

db.exec(`DROP TABLE IF EXISTS photos_new;`);
db.exec(`DROP TABLE IF EXISTS media_new;`);

const mediaColumns = db.prepare("PRAGMA table_info('media')").all();
if (!mediaColumns.some((col) => col.name === 'report_markdown')) {
    db.exec("ALTER TABLE media ADD COLUMN report_markdown TEXT NOT NULL DEFAULT ''");
}
db.exec("UPDATE media SET report_markdown = '' WHERE report_markdown IS NULL");

let needsMediaPublishedBootstrap = false;
if (!mediaColumns.some((col) => col.name === 'published_filename')) {
    db.exec("ALTER TABLE media ADD COLUMN published_filename TEXT");
    needsMediaPublishedBootstrap = true;
}
if (!mediaColumns.some((col) => col.name === 'published_original_name')) {
    db.exec("ALTER TABLE media ADD COLUMN published_original_name TEXT");
    needsMediaPublishedBootstrap = true;
}
if (!mediaColumns.some((col) => col.name === 'published_report_markdown')) {
    db.exec("ALTER TABLE media ADD COLUMN published_report_markdown TEXT NOT NULL DEFAULT ''");
    needsMediaPublishedBootstrap = true;
}
if (!mediaColumns.some((col) => col.name === 'published_order_index')) {
    db.exec("ALTER TABLE media ADD COLUMN published_order_index INTEGER DEFAULT 0");
    needsMediaPublishedBootstrap = true;
}
if (!mediaColumns.some((col) => col.name === 'is_published')) {
    db.exec("ALTER TABLE media ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0");
    needsMediaPublishedBootstrap = true;
}
if (!mediaColumns.some((col) => col.name === 'is_deleted_draft')) {
    db.exec("ALTER TABLE media ADD COLUMN is_deleted_draft INTEGER NOT NULL DEFAULT 0");
}
db.exec("UPDATE media SET is_deleted_draft = 0 WHERE is_deleted_draft IS NULL");
if (needsMediaPublishedBootstrap) {
    db.exec(`
        UPDATE media
        SET
            published_filename = filename,
            published_original_name = original_name,
            published_report_markdown = report_markdown,
            published_order_index = order_index,
            is_published = 1,
            is_deleted_draft = 0
    `);
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('index_display_type', 'single');

const bcrypt = require('bcryptjs');
const usersCountRow = db.prepare('SELECT COUNT(*) AS count FROM users').get();
const usersCount = usersCountRow ? (usersCountRow.count || 0) : 0;
if (usersCount === 0) {
    const defaultUsername = (process.env.DEFAULT_ADMIN_USERNAME || 'admin').trim() || 'admin';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(defaultPassword, salt);
    const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)');
    insertUser.run(defaultUsername, hashedPassword);
    console.log(`Default admin user created: username="${defaultUsername}", password=${process.env.DEFAULT_ADMIN_PASSWORD ? 'from DEFAULT_ADMIN_PASSWORD env' : '"admin"'}`);
}

const CONTENT_ROOT = resolveContentRoot({ baseDir: __dirname });
const collectionsDir = CONTENT_ROOT;

const rootImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const rootImagesLargeDir = path.join(CONTENT_ROOT, 'images', 'large');
let defaultIndexImage = '';
if (fs.existsSync(rootImagesLargeDir)) {
    try {
        const rootImageFiles = fs.readdirSync(rootImagesLargeDir)
            .filter((f) => rootImageExtensions.has(path.extname(f).toLowerCase()))
            .sort();
        if (rootImageFiles.length > 0) {
            defaultIndexImage = `../content/images/large/${rootImageFiles[0]}`;
        }
    } catch (_) {}
}
insertSetting.run('index_image', defaultIndexImage || '');
insertSetting.run('index_image_left', defaultIndexImage || '');
insertSetting.run('index_image_right', '');
if (defaultIndexImage) {
    console.log(`Default index image set from disk: ${rootImagesLargeDir}/${path.basename(defaultIndexImage)}`);
}

const seededFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get('initial_collections_seeded');
if (!seededFlag) {
    insertSetting.run('initial_collections_seeded', '1');
}

const allCollections = db.prepare('SELECT * FROM collections').all();
const insertMedia = db.prepare(`
    INSERT OR IGNORE INTO media (
        collection_id,
        filename,
        original_name,
        order_index,
        published_filename,
        published_original_name,
        published_report_markdown,
        published_order_index,
        is_published
    ) VALUES (?, ?, ?, ?, ?, ?, '', ?, 1)
`);
const deleteOrphanedMedia = db.prepare('DELETE FROM media WHERE id = ?');
const syncedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const syncedVideoExtensions = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv']);

allCollections.forEach((collection) => {
    const imagesOriginalPath = path.join(collectionsDir, collection.slug, 'content', 'images', 'original');
    const imagesLargePath = path.join(collectionsDir, collection.slug, 'content', 'images', 'large');
    const videosPath = path.join(collectionsDir, collection.slug, 'content', 'images', 'video');

    const filesOnDiskSet = new Set();

    const addFilesFromDir = (dirPath, allowedExtensions) => {
        if (!dirPath || !fs.existsSync(dirPath)) return;
        fs.readdirSync(dirPath).forEach((f) => {
            const ext = path.extname(f).toLowerCase();
            if (!allowedExtensions.has(ext)) return;
            filesOnDiskSet.add(f);
        });
    };

    addFilesFromDir(imagesOriginalPath, syncedImageExtensions);
    addFilesFromDir(imagesLargePath, syncedImageExtensions);
    addFilesFromDir(videosPath, syncedVideoExtensions);

    const filesOnDisk = Array.from(filesOnDiskSet);
    const mediaInDb = db.prepare('SELECT id, filename FROM media WHERE collection_id = ?').all(collection.id);
    const existingFilenames = new Set(mediaInDb.map((item) => item.filename));
    const maxOrderRow = db.prepare('SELECT MAX(order_index) as max FROM media WHERE collection_id = ?').get(collection.id);
    let nextOrder = (maxOrderRow && maxOrderRow.max !== null) ? maxOrderRow.max + 1 : 0;

    filesOnDisk.forEach((file) => {
        if (!existingFilenames.has(file)) {
            insertMedia.run(collection.id, file, file, nextOrder, file, file, nextOrder);
            nextOrder += 1;
            existingFilenames.add(file);
            console.log(`Synced new file from disk to DB: ${file} in collection ${collection.slug}`);
        }
    });

    mediaInDb.forEach(item => {
        if (!filesOnDiskSet.has(item.filename)) {
            console.log(`Removing orphaned database entry: ${item.filename} from collection ${collection.slug}`);
            deleteOrphanedMedia.run(item.id);
        }
    });
});

console.log('Database sync completed.');

module.exports = db;

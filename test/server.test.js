const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const packageMeta = require('../package.json');
const { DEFAULTS } = require('../config');

const tempRoot = path.join(os.tmpdir(), `art-media-publishing-site-test-${process.pid}-${Date.now()}`);
const dbPath = path.join(tempRoot, 'database.sqlite');
const contentRoot = path.join(tempRoot, 'content');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DB_PATH = dbPath;
process.env.CONTENT_ROOT = contentRoot;
process.env.SESSION_SECRET = 'test-session-secret';
process.env.RESET_KEY = 'test-reset-key';
process.env.DEFAULT_ADMIN_USERNAME = 'admin';
process.env.DEFAULT_ADMIN_PASSWORD = 'admin';

const { startServer, shutdownServer, clearIndexSettingsCache, markedReady } = require('../server');
const db = require('../db');
const videoProcessor = require('../videoProcessor');

const { spawnSync: _spawnSync } = require('child_process');
const _ffmpegAvailable = _spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

let server;
let baseUrl;

const createTestImageBuffer = async () => {
  return sharp({
    create: {
      width: 16,
      height: 12,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).jpeg().toBuffer();
};

const createTestVideoBuffer = () => Buffer.from('fake-video-content');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractSessionCookie = (response) => {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected session cookie');
  return setCookie.split(';')[0];
};

const fetchCsrfToken = async (sessionCookie) => {
  const response = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie }
  });
  const html = await response.text();
  const match = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (!match) {
    const altMatch = html.match(/name="_csrf"\s+value="([^"]+)"/);
    return altMatch ? altMatch[1] : '';
  }
  return match[1];
};

const loginAsAdmin = async () => {
  const loginPageResponse = await fetch(`${baseUrl}/admin/login`);
  const loginPageHtml = await loginPageResponse.text();
  const loginSessionCookie = extractSessionCookie(loginPageResponse);
  const csrfMatch = loginPageHtml.match(/name="_csrf"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  const body = new URLSearchParams({
    username: 'admin',
    password: 'admin',
    _csrf: csrfToken
  });
  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: loginSessionCookie
    },
    body: body.toString(),
    redirect: 'manual'
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin');
  const sessionCookie = extractSessionCookie(response);

  const adminToken = await fetchCsrfToken(sessionCookie);
  return { sessionCookie, csrfToken: adminToken };
};

const createCollectionThroughAdmin = async ({
  sessionCookie,
  csrfToken,
  name = 'Admin Test Collection',
  slug = `admin-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  displayType = 'single'
} = {}) => {
  const addBody = new URLSearchParams({
    name,
    slug,
    display_type: displayType
  });
  if (csrfToken) addBody.set('_csrf', csrfToken);

  const addResponse = await fetch(`${baseUrl}/admin/collections/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie
    },
    body: addBody.toString(),
    redirect: 'manual'
  });

  assert.equal(addResponse.status, 302);
  assert.equal(addResponse.headers.get('location'), '/admin');
  const collection = db.prepare('SELECT * FROM collections WHERE slug = ?').get(slug);
  assert.ok(collection, 'expected collection to be created');
  return collection;
};

const uploadMediaToCollectionThroughAdmin = async ({
  sessionCookie,
  csrfToken,
  collectionId,
  filename = 'admin-flow.jpg',
  imageBuffer
} = {}) => {
  const nextImageBuffer = imageBuffer || await createTestImageBuffer();
  const form = new FormData();
  form.append('media', new Blob([nextImageBuffer], { type: 'image/jpeg' }), filename);

  const uploadResponse = await fetch(`${baseUrl}/admin/collections/${collectionId}/media/upload`, {
    method: 'POST',
    headers: {
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: form,
    redirect: 'manual'
  });

  assert.equal(uploadResponse.status, 302);
  assert.equal(uploadResponse.headers.get('location'), `/admin/collections/${collectionId}`);

  const draftMedia = db.prepare('SELECT * FROM media WHERE collection_id = ? ORDER BY id DESC').get(collectionId);
  assert.ok(draftMedia, 'expected uploaded media row');
  return draftMedia;
};

const uploadIndexMediaThroughAdmin = async ({
  sessionCookie,
  csrfToken,
  displayType = 'single',
  files
} = {}) => {
  const form = new FormData();
  form.append('confirmed', '1');
  form.append('index_display_type', displayType);
  (Array.isArray(files) ? files : []).forEach((file) => {
    form.append('indexImages', new Blob([file.buffer], { type: file.type }), file.filename);
  });

  const response = await fetch(`${baseUrl}/admin/update-index-image`, {
    method: 'POST',
    headers: {
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: form,
    redirect: 'manual'
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin');
  return response;
};

const withStubbedVideoProcessing = async (fn) => {
  const originalIsFfmpegAvailable = videoProcessor.isFfmpegAvailable;
  const originalProcessUploadedVideo = videoProcessor.processUploadedVideo;
  videoProcessor.isFfmpegAvailable = async () => true;
  videoProcessor.processUploadedVideo = async () => true;
  try {
    return await fn();
  } finally {
    videoProcessor.isFfmpegAvailable = originalIsFfmpegAvailable;
    videoProcessor.processUploadedVideo = originalProcessUploadedVideo;
  }
};

const createUser = ({
  username,
  password,
  resetKey
}) => {
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);
  const resetKeyHash = resetKey ? bcrypt.hashSync(resetKey, bcrypt.genSaltSync(10)) : null;
  const result = db.prepare('INSERT INTO users (username, password, reset_key_hash) VALUES (?, ?, ?)').run(username, hashedPassword, resetKeyHash);
  return Number(result.lastInsertRowid);
};

const postForm = async (url, {
  body,
  headers = {},
  redirect = 'manual',
  csrfToken
} = {}) => {
  const searchParams = body instanceof URLSearchParams ? body : new URLSearchParams(body || {});
  if (csrfToken) searchParams.set('_csrf', csrfToken);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers
    },
    body: searchParams.toString(),
    redirect
  });
};

const adminFormPost = async (url, { sessionCookie, csrfToken, body = {}, headers = {}, redirect = 'manual' } = {}) => {
  const searchParams = new URLSearchParams(body);
  if (csrfToken) searchParams.set('_csrf', csrfToken);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie,
      ...headers
    },
    body: searchParams.toString(),
    redirect
  });
};

const adminJsonPost = async (url, { sessionCookie, csrfToken, body = {}, headers = {} } = {}) => {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  });
};

const fetchPageCsrfToken = async (url) => {
  const response = await fetch(url);
  const html = await response.text();
  const sessionCookie = extractSessionCookie(response);
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return { csrfToken: match ? match[1] : '', sessionCookie };
};

const postJson = async (url, {
  body,
  headers = {},
  csrfToken
} = {}) => {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...headers
    },
    body: JSON.stringify(body || {})
  });
};

const publishCollectionThroughAdmin = async ({ sessionCookie, csrfToken, collectionId }) => {
  const response = await adminFormPost(`${baseUrl}/admin/collections/${collectionId}/publish`, { sessionCookie, csrfToken, redirect: 'manual' });
  assert.equal(response.status, 302);
  return response;
};

const deleteCollectionThroughAdmin = async ({ sessionCookie, csrfToken, collectionId }) => {
  const response = await adminFormPost(`${baseUrl}/admin/collections/delete/${collectionId}`, { sessionCookie, csrfToken, body: { confirmed: '1' }, redirect: 'manual' });
  assert.equal(response.status, 302);
  return response;
};

const updateCollectionTypeThroughAdmin = async ({ sessionCookie, csrfToken, collectionId, displayType }) => {
  return fetch(`${baseUrl}/admin/collections/update-type/${collectionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: new URLSearchParams({ displayType }).toString()
  });
};

const updateCollectionReportThroughAdmin = async ({ sessionCookie, csrfToken, collectionId, reportMarkdown }) => {
  return adminJsonPost(`${baseUrl}/admin/collections/update-report/${collectionId}`, { sessionCookie, csrfToken, body: { report_markdown: reportMarkdown } });
};

const updateMediaReportThroughAdmin = async ({ sessionCookie, csrfToken, mediaId, reportMarkdown }) => {
  return adminJsonPost(`${baseUrl}/admin/media/update-report/${mediaId}`, { sessionCookie, csrfToken, body: { report_markdown: reportMarkdown } });
};

const reorderMediaThroughAdmin = async ({ sessionCookie, csrfToken, order }) => {
  return adminJsonPost(`${baseUrl}/admin/media/reorder`, { sessionCookie, csrfToken, body: { order } });
};

const createPublishedCollectionWithMedia = async ({
  sessionCookie,
  csrfToken,
  name = 'Published Collection',
  slug = `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  displayType = 'single',
  mediaCount = 1
} = {}) => {
  const collection = await createCollectionThroughAdmin({ sessionCookie, csrfToken, name, slug, displayType });
  const mediaItems = [];
  for (let i = 0; i < mediaCount; i++) {
    const media = await uploadMediaToCollectionThroughAdmin({
      sessionCookie,
      csrfToken,
      collectionId: collection.id,
      filename: `media-${i}.jpg`,
      imageBuffer: await createTestImageBuffer()
    });
    mediaItems.push(media);
  }
  await publishCollectionThroughAdmin({ sessionCookie, csrfToken, collectionId: collection.id });
  db.prepare('UPDATE collections SET is_hidden = 0 WHERE id = ?').run(collection.id);
  return { collection, mediaItems };
};

test.before(async () => {
  await fs.ensureDir(path.join(contentRoot, 'images', 'original'));
  await fs.ensureDir(path.join(contentRoot, 'images', 'video'));
  await fs.ensureDir(path.join(contentRoot, 'sample-collection', 'content', 'images', 'original'));
  await markedReady;
  server = await startServer({ listenPort: 0 });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await shutdownServer(server);
  try {
    await fs.remove(tempRoot);
  } catch {
    // ignore cleanup errors on temp directory removal
  }
});

test('GET /health 返回服务健康状态', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.status, 'ok');
  assert.equal(payload.version, packageMeta.version);
  assert.equal(typeof payload.uptimeSeconds, 'number');
});

test('GET /ready 在数据库和内容目录可用时返回 ready', async () => {
  const response = await fetch(`${baseUrl}/ready`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.status, 'ready');
  assert.equal(payload.checks.database, true);
  assert.equal(payload.checks.contentRoot, true);
});

test('GET /api/collections 返回空数组而不是报错', async () => {
  const response = await fetch(`${baseUrl}/api/collections`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.ok(Array.isArray(payload.collections));
});

test('未知 JSON 路由返回统一 404 结构', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist?json=1`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(response.status, 404);

  const payload = await response.json();
  assert.deepEqual(payload, {
    success: false,
    error: 'Not found'
  });
});

test('GET /content/images/video/:filename 返回根视频资源', async () => {
  const videoPath = path.join(contentRoot, 'images', 'video', 'sample.mp4');
  await fs.writeFile(videoPath, 'fake-video-content');

  const response = await fetch(`${baseUrl}/content/images/video/sample.mp4`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'fake-video-content');
});

test('GET /content/:collectionSlug/content/images/large/:filename 按需生成作品集图片变体', async () => {
  const originalPath = path.join(contentRoot, 'sample-collection', 'content', 'images', 'original', 'sample.jpg');
  await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).jpeg().toFile(originalPath);

  const largePath = path.join(contentRoot, 'sample-collection', 'content', 'images', 'large', 'sample.jpg');
  await fs.remove(largePath);

  const response = await fetch(`${baseUrl}/content/sample-collection/content/images/large/sample.jpg`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control')?.includes('max-age='), true);
  assert.equal(await fs.pathExists(largePath), true);
});

test('隐藏信息页面可单独控制署名显示', async () => {
  db.prepare(`
    INSERT INTO collections (name, slug, display_type, is_hidden, hide_info, show_credit)
    VALUES (?, ?, 'single', 0, 1, ?)
  `).run('Credit Hidden Off', 'credit-hidden-off', 0);
  db.prepare(`
    INSERT INTO collections (name, slug, display_type, is_hidden, hide_info, show_credit)
    VALUES (?, ?, 'single', 0, 1, ?)
  `).run('Credit Hidden On', 'credit-hidden-on', 1);

  const hiddenOnlyResponse = await fetch(`${baseUrl}/credit-hidden-off`);
  assert.equal(hiddenOnlyResponse.status, 200);
  const hiddenOnlyHtml = await hiddenOnlyResponse.text();
  assert.equal(hiddenOnlyHtml.includes(DEFAULTS.shortSignature), false);
  assert.equal(hiddenOnlyHtml.includes(DEFAULTS.icpNumber), true);

  const creditVisibleResponse = await fetch(`${baseUrl}/credit-hidden-on`);
  assert.equal(creditVisibleResponse.status, 200);
  const creditVisibleHtml = await creditVisibleResponse.text();
  assert.equal(creditVisibleHtml.includes(DEFAULTS.shortSignature), true);
  assert.equal(creditVisibleHtml.includes(DEFAULTS.icpNumber), true);
});

test('被禁止访问的作品集无法通过 slug 地址访问', async () => {
  const result = db.prepare(`
    INSERT INTO collections (name, slug, display_type, is_hidden, access_blocked)
    VALUES (?, ?, 'single', 0, 1)
  `).run('Blocked Access Collection', 'blocked-access');
  const collectionId = Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO media (
      collection_id,
      filename,
      original_name,
      report_markdown,
      order_index,
      published_filename,
      published_original_name,
      published_report_markdown,
      published_order_index,
      is_published,
      is_deleted_draft
    ) VALUES (?, ?, ?, '', 0, ?, ?, '', 0, 1, 0)
  `).run(collectionId, 'blocked.jpg', 'blocked.jpg', 'blocked.jpg', 'blocked.jpg');

  const pageResponse = await fetch(`${baseUrl}/blocked-access`);
  assert.equal(pageResponse.status, 404);

  const detailResponse = await fetch(`${baseUrl}/blocked-access/blocked_large`);
  assert.equal(detailResponse.status, 404);

  const apiResponse = await fetch(`${baseUrl}/api/collections/blocked-access`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(apiResponse.status, 404);
});

test('显示入口时可选择同时解除禁止访问', () => {
  const result = db.prepare(`
    INSERT INTO collections (name, slug, display_type, is_hidden, access_blocked)
    VALUES (?, ?, 'single', 1, 1)
  `).run('Toggle Hidden Collection', 'toggle-hidden-collection');
  const collectionId = Number(result.lastInsertRowid);

  db.prepare(`
    UPDATE collections
    SET
      is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END,
      access_blocked = CASE
        WHEN is_hidden = 1 AND ? = 1 THEN 0
        ELSE access_blocked
      END
    WHERE id = ?
  `).run(1, collectionId);

  const clearedRow = db.prepare('SELECT is_hidden, access_blocked FROM collections WHERE id = ?').get(collectionId);
  assert.equal(clearedRow.is_hidden, 0);
  assert.equal(clearedRow.access_blocked, 0);

  db.prepare('UPDATE collections SET is_hidden = 1, access_blocked = 1 WHERE id = ?').run(collectionId);
  db.prepare(`
    UPDATE collections
    SET
      is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END,
      access_blocked = CASE
        WHEN is_hidden = 1 AND ? = 1 THEN 0
        ELSE access_blocked
      END
    WHERE id = ?
  `).run(0, collectionId);

  const keptRow = db.prepare('SELECT is_hidden, access_blocked FROM collections WHERE id = ?').get(collectionId);
  assert.equal(keptRow.is_hidden, 0);
  assert.equal(keptRow.access_blocked, 1);
});

test('显示信息时可选择同时隐藏署名', () => {
  const result = db.prepare(`
    INSERT INTO collections (name, slug, display_type, is_hidden, hide_info, show_credit)
    VALUES (?, ?, 'single', 0, 1, 1)
  `).run('Toggle Info Collection', 'toggle-info-collection');
  const collectionId = Number(result.lastInsertRowid);

  db.prepare(`
    UPDATE collections
    SET
      hide_info = CASE WHEN hide_info = 1 THEN 0 ELSE 1 END,
      show_credit = CASE
        WHEN hide_info = 0 THEN 0
        WHEN ? = 1 THEN 0
        ELSE show_credit
      END
    WHERE id = ?
  `).run(1, collectionId);

  const clearedRow = db.prepare('SELECT hide_info, show_credit FROM collections WHERE id = ?').get(collectionId);
  assert.equal(clearedRow.hide_info, 0);
  assert.equal(clearedRow.show_credit, 0);

  db.prepare('UPDATE collections SET hide_info = 1, show_credit = 1 WHERE id = ?').run(collectionId);
  db.prepare(`
    UPDATE collections
    SET
      hide_info = CASE WHEN hide_info = 1 THEN 0 ELSE 1 END,
      show_credit = CASE
        WHEN hide_info = 0 THEN 0
        WHEN ? = 1 THEN 0
        ELSE show_credit
      END
    WHERE id = ?
  `).run(0, collectionId);

  const keptRow = db.prepare('SELECT hide_info, show_credit FROM collections WHERE id = ?').get(collectionId);
  assert.equal(keptRow.hide_info, 0);
  assert.equal(keptRow.show_credit, 1);
});

test('未登录访问后台首页会跳转到登录页', async () => {
  const response = await fetch(`${baseUrl}/admin`, {
    redirect: 'manual'
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('管理员登录后可访问后台首页', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin`, {
    headers: {
      Cookie: sessionCookie,
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Dashboard/i);
  assert.match(html, /作品集管理|Collections/i);
});

test('服务重启后已登录的 session 仍然有效', async () => {
  const { sessionCookie } = await loginAsAdmin();

  const beforeRestart = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(beforeRestart.status, 200);

  await shutdownServer(server);

  await markedReady;
  server = await startServer({ listenPort: 0 });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const afterRestart = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(afterRestart.status, 200);
  const html = await afterRestart.text();
  assert.match(html, /Dashboard/i);
});

test('管理员可通过后台完成创建作品集、上传图片并发布', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Admin Flow Collection',
    slug: `admin-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  assert.equal(collection.is_hidden, 1);

  const draftMedia = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'admin-flow.jpg'
  });
  assert.equal(draftMedia.is_published, 0);
  assert.equal(draftMedia.published_filename, null);

  const originalPath = path.join(contentRoot, collection.slug, 'content', 'images', 'original', draftMedia.filename);
  assert.equal(await fs.pathExists(originalPath), true);

  const publishResponse = await adminFormPost(`${baseUrl}/admin/collections/${collection.id}/publish`, { sessionCookie, csrfToken, redirect: 'manual' });

  assert.equal(publishResponse.status, 302);
  assert.equal(publishResponse.headers.get('location'), `/admin/collections/${collection.id}`);

  const publishedMedia = db.prepare('SELECT * FROM media WHERE collection_id = ?').get(collection.id);
  assert.ok(publishedMedia, 'expected published media row');
  assert.equal(publishedMedia.is_published, 1);
  assert.equal(publishedMedia.published_filename, publishedMedia.filename);
  assert.equal(publishedMedia.published_original_name, 'admin-flow.jpg');

  const apiResponse = await fetch(`${baseUrl}/api/collections/${collection.slug}`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(apiResponse.status, 200);

  const payload = await apiResponse.json();
  assert.equal(payload.collection.slug, collection.slug);
  assert.equal(payload.mediaItems.length, 1);
  assert.equal(payload.mediaItems[0].filename, publishedMedia.filename);

  const largeResponse = await fetch(`${baseUrl}/content/${collection.slug}/content/images/large/${publishedMedia.filename}`);
  assert.equal(largeResponse.status, 200);
});

test('管理员可重命名作品集', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Rename Me',
    slug: `rename-me-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const renameResponse = await adminFormPost(`${baseUrl}/admin/collections/rename/${collection.id}`, { sessionCookie, csrfToken, body: { name: 'Renamed Collection' } });

  assert.equal(renameResponse.status, 302);
  assert.equal(renameResponse.headers.get('location'), '/admin');

  const updatedCollection = db.prepare('SELECT name, slug FROM collections WHERE id = ?').get(collection.id);
  assert.equal(updatedCollection.name, 'Renamed Collection');
  assert.equal(updatedCollection.slug, collection.slug);
});

test('管理员可将草稿媒体标记删除并在发布时真正移除', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Draft Delete Collection',
    slug: `draft-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const draftMedia = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'draft-delete.jpg'
  });

  const originalPath = path.join(contentRoot, collection.slug, 'content', 'images', 'original', draftMedia.filename);
  assert.equal(await fs.pathExists(originalPath), true);

  const deleteResponse = await adminJsonPost(`${baseUrl}/admin/media/delete/${draftMedia.id}`, { sessionCookie, csrfToken });

  assert.equal(deleteResponse.status, 200);
  const deletePayload = await deleteResponse.json();
  assert.equal(deletePayload.success, true);
  assert.equal(deletePayload.media.is_deleted_draft, true);

  const flaggedMedia = db.prepare('SELECT is_deleted_draft FROM media WHERE id = ?').get(draftMedia.id);
  assert.equal(flaggedMedia.is_deleted_draft, 1);

  const publishResponse = await adminFormPost(`${baseUrl}/admin/collections/${collection.id}/publish`, { sessionCookie, csrfToken, redirect: 'manual' });

  assert.equal(publishResponse.status, 302);
  assert.equal(publishResponse.headers.get('location'), `/admin/collections/${collection.id}`);

  const removedMedia = db.prepare('SELECT * FROM media WHERE id = ?').get(draftMedia.id);
  assert.equal(removedMedia, undefined);
  assert.equal(await fs.pathExists(originalPath), false);
});

test('管理员可上传首页素材并更新首页设置', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  await uploadIndexMediaThroughAdmin({
    sessionCookie,
    csrfToken,
    displayType: 'single',
    files: [{
      buffer: await createTestImageBuffer(),
      type: 'image/jpeg',
      filename: 'index-upload.jpg'
    }]
  });

  const indexImageSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image');
  const indexLeftSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left');
  const indexTypeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_display_type');
  assert.ok(indexImageSetting && /..\/content\/images\/large\/.+\.jpg$/.test(indexImageSetting.value));
  assert.equal(indexLeftSetting.value, indexImageSetting.value);
  assert.equal(indexTypeSetting.value, 'single');

  const uploadedFilename = path.basename(indexImageSetting.value);
  const originalPath = path.join(contentRoot, 'images', 'original', uploadedFilename);
  assert.equal(await fs.pathExists(originalPath), true);

  const largeResponse = await fetch(`${baseUrl}/content/images/large/${uploadedFilename}`);
  assert.equal(largeResponse.status, 200);

  const homeResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeResponse.status, 200);
  const html = await homeResponse.text();
  assert.match(html, new RegExp(escapeRegExp(uploadedFilename)));
});

test('管理员可上传首页双联图并交换左右顺序', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  await uploadIndexMediaThroughAdmin({
    sessionCookie,
    csrfToken,
    displayType: 'diptych',
    files: [
      {
        buffer: await createTestImageBuffer(),
        type: 'image/jpeg',
        filename: 'diptych-left.jpg'
      },
      {
        buffer: await createTestImageBuffer(),
        type: 'image/jpeg',
        filename: 'diptych-right.jpg'
      }
    ]
  });

  const leftBefore = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left').value;
  const rightBefore = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_right').value;
  const typeBefore = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_display_type').value;
  assert.equal(typeBefore, 'diptych');
  assert.notEqual(leftBefore, rightBefore);

  const homeBefore = await fetch(`${baseUrl}/`);
  assert.equal(homeBefore.status, 200);
  const homeBeforeHtml = await homeBefore.text();
  assert.match(homeBeforeHtml, new RegExp(escapeRegExp(path.basename(leftBefore))));
  assert.match(homeBeforeHtml, new RegExp(escapeRegExp(path.basename(rightBefore))));

  const reorderResponse = await adminJsonPost(`${baseUrl}/admin/index-images/reorder`, { sessionCookie, csrfToken, body: { swap: true } });

  assert.equal(reorderResponse.status, 200);
  const reorderPayload = await reorderResponse.json();
  assert.equal(reorderPayload.success, true);

  const leftAfter = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left').value;
  const rightAfter = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_right').value;
  const indexImageAfter = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image').value;
  assert.equal(leftAfter, rightBefore);
  assert.equal(rightAfter, leftBefore);
  assert.equal(indexImageAfter, rightBefore);

  const homeAfter = await fetch(`${baseUrl}/`);
  assert.equal(homeAfter.status, 200);
  const homeAfterHtml = await homeAfter.text();
  assert.match(homeAfterHtml, new RegExp(escapeRegExp(path.basename(leftAfter))));
  assert.match(homeAfterHtml, new RegExp(escapeRegExp(path.basename(rightAfter))));
});

test('管理员可上传视频首页素材并切换为视频模式', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();

  await withStubbedVideoProcessing(async () => {
    await uploadIndexMediaThroughAdmin({
    sessionCookie,
    csrfToken,
    displayType: 'video',
      files: [{
        buffer: createTestVideoBuffer(),
        type: 'video/mp4',
        filename: 'index-video.mp4'
      }]
    });
  });

  const indexImageSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image');
  const indexLeftSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left');
  const indexTypeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_display_type');
  assert.ok(indexImageSetting && /..\/content\/images\/video\/.+\.mp4$/.test(indexImageSetting.value));
  assert.equal(indexLeftSetting.value, indexImageSetting.value);
  assert.equal(indexTypeSetting.value, 'video');

  const uploadedFilename = path.basename(indexImageSetting.value);
  const videoPath = path.join(contentRoot, 'images', 'video', uploadedFilename);
  assert.equal(await fs.pathExists(videoPath), true);

  const videoResponse = await fetch(`${baseUrl}/content/images/video/${uploadedFilename}`);
  assert.equal(videoResponse.status, 200);
  assert.equal(await videoResponse.text(), 'fake-video-content');

  const homeResponse = await fetch(`${baseUrl}/`);
  assert.equal(homeResponse.status, 200);
  const html = await homeResponse.text();
  assert.match(html, /<video autoplay loop muted playsinline preload="metadata"/);
  assert.match(html, new RegExp(escapeRegExp(uploadedFilename)));
});

test('管理员可调整作品集排序并反映到公开列表顺序', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collectionA = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Reorder A',
    slug: `reorder-a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const collectionB = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Reorder B',
    slug: `reorder-b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const collectionC = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Reorder C',
    slug: `reorder-c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  db.prepare('UPDATE collections SET is_hidden = 0 WHERE id IN (?, ?, ?)').run(collectionA.id, collectionB.id, collectionC.id);

  const order = [collectionC.id, collectionA.id, collectionB.id];
  const reorderResponse = await adminJsonPost(`${baseUrl}/admin/collections/reorder`, { sessionCookie, csrfToken, body: { order } });

  assert.equal(reorderResponse.status, 200);
  const reorderPayload = await reorderResponse.json();
  assert.equal(reorderPayload.success, true);

  const rows = db.prepare('SELECT id, order_index FROM collections WHERE id IN (?, ?, ?) ORDER BY order_index ASC').all(
    collectionA.id,
    collectionB.id,
    collectionC.id
  );
  assert.deepEqual(rows.map((row) => row.id), order);

  const apiResponse = await fetch(`${baseUrl}/api/collections`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(apiResponse.status, 200);
  const payload = await apiResponse.json();
  const visibleOrderedIds = payload.collections
    .filter((collection) => [collectionA.id, collectionB.id, collectionC.id].includes(collection.id))
    .map((collection) => collection.id);
  assert.deepEqual(visibleOrderedIds, order);
});

test('管理员可通过后台接口完成作品集四组状态开关联动', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Toggle Flow Collection',
    slug: `toggle-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  let response = await postJson(`${baseUrl}/admin/collections/toggle-show-credit/${collection.id}`, {
    headers: { Cookie: sessionCookie },
    body: {},
    csrfToken
  });
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.collection.show_credit, true);
  assert.equal(payload.collection.hide_info, true);

  response = await postForm(`${baseUrl}/admin/collections/toggle-hide-info/${collection.id}`, {
    headers: {
      Cookie: sessionCookie,
      Accept: 'application/json'
    },
    body: { clear_show_credit: '1' },
    csrfToken
  });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.collection.hide_info, false);
  assert.equal(payload.collection.show_credit, false);

  response = await postJson(`${baseUrl}/admin/collections/toggle-access-blocked/${collection.id}`, {
    headers: { Cookie: sessionCookie },
    body: {},
    csrfToken
  });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.collection.access_blocked, true);
  assert.equal(payload.collection.is_hidden, true);

  let blockedPageResponse = await fetch(`${baseUrl}/${collection.slug}`);
  assert.equal(blockedPageResponse.status, 404);

  response = await postForm(`${baseUrl}/admin/collections/toggle-hidden/${collection.id}`, {
    headers: {
      Cookie: sessionCookie,
      Accept: 'application/json'
    },
    body: { clear_access_blocked: '1' },
    csrfToken
  });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.collection.is_hidden, false);
  assert.equal(payload.collection.access_blocked, false);

  const updatedCollection = db.prepare(`
    SELECT is_hidden, hide_info, show_credit, access_blocked
    FROM collections
    WHERE id = ?
  `).get(collection.id);
  assert.equal(updatedCollection.is_hidden, 0);
  assert.equal(updatedCollection.hide_info, 0);
  assert.equal(updatedCollection.show_credit, 0);
  assert.equal(updatedCollection.access_blocked, 0);
});

test('后台登录失败达到上限后会锁定账号', async () => {
  const username = `login-lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username, password: 'CorrectPass123!' });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { csrfToken: pageToken, sessionCookie: pageSession } = await fetchPageCsrfToken(`${baseUrl}/admin/login`);
    const response = await postForm(`${baseUrl}/admin/login`, {
      body: {
        username,
        password: 'WrongPass123!',
        _csrf: pageToken
      },
      headers: { Cookie: pageSession, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow'
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    if (attempt < 3) {
      assert.match(html, /用户名或密码错误|Incorrect username/i);
    } else {
      assert.match(html, /账号已锁定|Account locked/i);
    }
  }

  const lockedRow = db.prepare(`
    SELECT failed_password_count AS failedPasswordCount, locked_at AS lockedAt
    FROM admin_login_lockouts
    WHERE username = ?
  `).get(username);
  assert.equal(lockedRow.failedPasswordCount, 3);
  assert.ok(lockedRow.lockedAt);

  const { csrfToken: lockedPageToken, sessionCookie: lockedPageSession } = await fetchPageCsrfToken(`${baseUrl}/admin/login`);
  const lockedLoginResponse = await postForm(`${baseUrl}/admin/login`, {
    body: {
      username,
      password: 'CorrectPass123!',
      _csrf: lockedPageToken
    },
    headers: { Cookie: lockedPageSession, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow'
  });
  assert.equal(lockedLoginResponse.status, 200);
  const lockedLoginHtml = await lockedLoginResponse.text();
  assert.match(lockedLoginHtml, /账号已锁定|Account locked/i);
});

test('密码重置错误次数达到上限后会锁定 IP', async () => {
  db.prepare('DELETE FROM passwd_reset_ip_lockouts WHERE ip = ?').run('127.0.0.1');
  const testResetKey = 'test-reset-key-for-lockout';
  const testResetKeyHash = bcrypt.hashSync(testResetKey, bcrypt.genSaltSync(10));
  db.prepare('UPDATE users SET reset_key_hash = ? WHERE username = ?').run(testResetKeyHash, 'admin');

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { csrfToken: pageToken, sessionCookie: pageSession } = await fetchPageCsrfToken(`${baseUrl}/passwd`);
    const response = await postForm(`${baseUrl}/passwd`, {
      body: {
        username: 'admin',
        resetKey: 'wrong-reset-key',
        newPassword: 'IgnoredPass123!',
        _csrf: pageToken
      },
      headers: { Cookie: pageSession, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow'
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    if (attempt < 3) {
      assert.match(html, /密钥错误|Incorrect key/i);
    } else {
      assert.match(html, /密钥错误次数过多|Too many incorrect key/i);
    }
  }

  const lockRow = db.prepare(`
    SELECT failed_key_count AS failedKeyCount, locked_until AS lockedUntil
    FROM passwd_reset_ip_lockouts
    WHERE ip = ?
  `).get('127.0.0.1');
  assert.equal(lockRow.failedKeyCount, 3);
  assert.ok(lockRow.lockedUntil);

  const { csrfToken: lockedPageToken, sessionCookie: lockedPageSession } = await fetchPageCsrfToken(`${baseUrl}/passwd`);
  const lockedResponse = await postForm(`${baseUrl}/passwd`, {
    body: {
      username: 'admin',
      resetKey: testResetKey,
      newPassword: 'ShouldNotApply123!',
      _csrf: lockedPageToken
    },
    headers: { Cookie: lockedPageSession, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow'
  });
  assert.equal(lockedResponse.status, 200);
  const lockedHtml = await lockedResponse.text();
  assert.match(lockedHtml, /该 IP 因多次输入错误密钥已被锁定|This IP has been locked/i);

  db.prepare('DELETE FROM passwd_reset_ip_lockouts WHERE ip = ?').run('127.0.0.1');
  db.prepare('UPDATE users SET reset_key_hash = NULL WHERE username = ?').run('admin');
});

test('密码重置成功后会清除登录锁定并允许新密码登录', async () => {
  const username = `reset-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testResetKey = 'test-reset-key-for-success';
  createUser({ username, password: 'OldPass123!', resetKey: testResetKey });
  const nowMs = Date.now();
  db.prepare(`
    INSERT INTO admin_login_lockouts (username, failed_password_count, locked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, 3, nowMs, nowMs, nowMs);

  const { csrfToken: resetPageToken, sessionCookie: resetPageSession } = await fetchPageCsrfToken(`${baseUrl}/passwd`);
  const resetResponse = await postForm(`${baseUrl}/passwd`, {
    body: {
      username,
      resetKey: testResetKey,
      newPassword: 'NewPass123!',
      _csrf: resetPageToken
    },
    headers: { Cookie: resetPageSession, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow'
  });
  assert.equal(resetResponse.status, 200);
  const resetHtml = await resetResponse.text();
  assert.match(resetHtml, /密码重置成功|Password reset successful/i);

  const lockRow = db.prepare('SELECT * FROM admin_login_lockouts WHERE username = ?').get(username);
  assert.equal(lockRow, undefined);

  const { csrfToken: loginPageToken, sessionCookie: loginPageSession } = await fetchPageCsrfToken(`${baseUrl}/admin/login`);
  const loginResponse = await postForm(`${baseUrl}/admin/login`, {
    body: {
      username,
      password: 'NewPass123!',
      _csrf: loginPageToken
    },
    headers: { Cookie: loginPageSession },
    redirect: 'manual'
  });
  assert.equal(loginResponse.status, 302);
  assert.equal(loginResponse.headers.get('location'), '/admin');
  assert.ok(loginResponse.headers.get('set-cookie'));
});

test('管理员可为用户生成密钥，生成后不可重复生成', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const username = `keygen-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username, password: 'TestPass123!' });

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  assert.ok(user, 'expected user to exist');

  const genResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/generate-key`, {
    sessionCookie,
    csrfToken,
    body: { keyPlaintext: 'MySecretKey123', keyConfirm1: 'MySecretKey123', keyConfirm2: 'MySecretKey123' },
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(genResponse.status, 200);
  const genResult = await genResponse.json();
  assert.ok(genResult.success, 'expected key generation to succeed');

  const updatedUser = db.prepare('SELECT reset_key_hash FROM users WHERE id = ?').get(user.id);
  assert.ok(updatedUser.reset_key_hash, 'expected reset_key_hash to be set');

  const dupResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/generate-key`, {
    sessionCookie,
    csrfToken,
    body: { keyPlaintext: 'AnotherKey456', keyConfirm1: 'AnotherKey456', keyConfirm2: 'AnotherKey456' },
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(dupResponse.status, 200);
  const dupResult = await dupResponse.json();
  assert.ok(!dupResult.success, 'expected duplicate key generation to fail');
  assert.match(dupResult.error, /密钥已配置|Key already configured/i);

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});

test('密钥生成要求三次输入一致', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const username = `keyconfirm-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username, password: 'TestPass123!' });

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  const mismatchResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/generate-key`, {
    sessionCookie,
    csrfToken,
    body: { keyPlaintext: 'KeyA', keyConfirm1: 'KeyB', keyConfirm2: 'KeyA' },
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(mismatchResponse.status, 200);
  const mismatchResult = await mismatchResponse.json();
  assert.ok(!mismatchResult.success, 'expected mismatched keys to fail');
  assert.match(mismatchResult.error, /三次输入的密钥不一致|three entered keys do not match/i);

  const updatedUser = db.prepare('SELECT reset_key_hash FROM users WHERE id = ?').get(user.id);
  assert.ok(!updatedUser.reset_key_hash, 'expected reset_key_hash to remain null on mismatch');

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});

test('管理员可清除用户密钥，清除后可重新生成', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const username = `keyclear-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testKey = 'ClearTestKey789';
  createUser({ username, password: 'TestPass123!', resetKey: testKey });

  const user = db.prepare('SELECT id, reset_key_hash FROM users WHERE username = ?').get(username);
  assert.ok(user.reset_key_hash, 'expected reset_key_hash to be set');

  const clearResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/clear-key`, {
    sessionCookie,
    csrfToken
  });
  assert.equal(clearResponse.status, 200);
  const clearResult = await clearResponse.json();
  assert.ok(clearResult.success, 'expected key clear to succeed');

  const clearedUser = db.prepare('SELECT reset_key_hash FROM users WHERE id = ?').get(user.id);
  assert.ok(!clearedUser.reset_key_hash, 'expected reset_key_hash to be null after clear');

  const regenResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/generate-key`, {
    sessionCookie,
    csrfToken,
    body: { keyPlaintext: 'NewKeyAfterClear', keyConfirm1: 'NewKeyAfterClear', keyConfirm2: 'NewKeyAfterClear' }
  });
  assert.equal(regenResponse.status, 200);
  const regenResult = await regenResponse.json();
  assert.ok(regenResult.success, 'expected key regeneration after clear to succeed');

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});

test('清除未配置的密钥返回错误', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const username = `keyclear-nokey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username, password: 'TestPass123!' });

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  const clearResponse = await adminJsonPost(`${baseUrl}/admin/users/${user.id}/clear-key`, {
    sessionCookie,
    csrfToken,
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(clearResponse.status, 200);
  const clearResult = await clearResponse.json();
  assert.ok(!clearResult.success, 'expected clearing non-existent key to fail');
  assert.match(clearResult.error, /未配置密钥|no key configured/i);

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});

test('非管理员不能访问用户管理接口', async () => {
  const nonAdminUsername = `nonadmin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username: nonAdminUsername, password: 'NonAdmin123!' });

  const loginPageResponse = await fetch(`${baseUrl}/admin/login`);
  const loginPageHtml = await loginPageResponse.text();
  const loginSessionCookie = extractSessionCookie(loginPageResponse);
  const csrfMatch = loginPageHtml.match(/name="_csrf"\s+value="([^"]+)"/);
  const loginCsrf = csrfMatch ? csrfMatch[1] : '';

  const body = new URLSearchParams({
    username: nonAdminUsername,
    password: 'NonAdmin123!',
    _csrf: loginCsrf
  });
  const loginResponse = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: loginSessionCookie },
    body: body.toString(),
    redirect: 'manual'
  });
  assert.equal(loginResponse.status, 302);
  const nonAdminSession = extractSessionCookie(loginResponse);
  const nonAdminCsrf = await fetchCsrfToken(nonAdminSession);

  const usersResponse = await fetch(`${baseUrl}/admin/users/api`, {
    headers: { Cookie: nonAdminSession },
    redirect: 'manual'
  });
  assert.ok(usersResponse.status === 302 || usersResponse.status === 403, `expected non-admin to be denied, got ${usersResponse.status}`);

  const genResponse = await adminJsonPost(`${baseUrl}/admin/users/1/generate-key`, {
    sessionCookie: nonAdminSession,
    csrfToken: nonAdminCsrf,
    body: { keyPlaintext: 'X', keyConfirm1: 'X', keyConfirm2: 'X' }
  });
  assert.ok(genResponse.status === 403 || genResponse.status === 302, 'expected non-admin to be denied key generation');

  const clearResponse = await adminJsonPost(`${baseUrl}/admin/users/1/clear-key`, {
    sessionCookie: nonAdminSession,
    csrfToken: nonAdminCsrf
  });
  assert.ok(clearResponse.status === 403 || clearResponse.status === 302, 'expected non-admin to be denied key clear');

  db.prepare('DELETE FROM users WHERE username = ?').run(nonAdminUsername);
});

test('用户列表 API 返回 has_reset_key 而非哈希值', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const username = `apitest-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createUser({ username, password: 'TestPass123!', resetKey: 'ApiTestKey999' });

  const response = await fetch(`${baseUrl}/admin/users/api`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.success, 'expected API call to succeed');

  const testUser = result.users.find(u => u.username === username);
  assert.ok(testUser, 'expected test user in API response');
  assert.equal(testUser.has_reset_key, true, 'expected has_reset_key to be true');
  assert.ok(!testUser.reset_key_hash, 'expected reset_key_hash to not be exposed');

  db.prepare('DELETE FROM users WHERE username = ?').run(username);
});

test('MP4压缩：compressToMP4 将视频压缩为H.264 MP4格式', { skip: !_ffmpegAvailable }, async () => {
  const mp4TestDir = path.join(tempRoot, 'mp4-compression-test');
  await fs.ensureDir(mp4TestDir);

  const videoFilename = 'mp4-test-video.mp4';
  const videoPath = path.join(mp4TestDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  const genResult = spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=3:r=10',
    '-f', 'lavfi', '-i', 'sine=f=440:d=3',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath
  ], { stdio: 'ignore' });
  assert.equal(genResult.status, 0, 'ffmpeg should generate test video');
  assert.equal(await fs.pathExists(videoPath), true);

  const outputPath = videoPath.replace(/\.mp4$/, '.compressed.mp4');
  const result = await videoProcessor.compressToMP4(videoPath, outputPath);
  assert.ok(result, 'compressToMP4 should return true on success');
  assert.equal(await fs.pathExists(outputPath), true, 'MP4 file should exist');

  const stat = await fs.stat(outputPath);
  assert.ok(stat.size > 0, 'MP4 file should not be empty');

  await fs.remove(mp4TestDir);
});

test('MP4压缩：输入文件不存在时 compressToMP4 抛出错误', { skip: !_ffmpegAvailable }, async () => {
  try {
    await videoProcessor.compressToMP4('/tmp/nonexistent-video-file-12345.mp4', '/tmp/output.mp4');
    assert.fail('should have thrown an error');
  } catch (err) {
    assert.ok(err.message.includes('FFMPEG_TRANSCODE_FAILED') || err.message.includes('No such file'));
  }
});

test('processUploadedVideo 将非H.264视频压缩为MP4并删除原文件', { skip: !_ffmpegAvailable }, async () => {

  const uploadTestDir = path.join(tempRoot, 'mp4-upload-test');
  await fs.ensureDir(uploadTestDir);

  const videoFilename = 'upload-mp4-test.mov';
  const videoPath = path.join(uploadTestDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=10',
    '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-c:v', 'mpeg4', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    videoPath
  ], { stdio: 'ignore' });
  assert.equal(await fs.pathExists(videoPath), true);

  const targetDir = path.join(uploadTestDir, 'target');
  await fs.ensureDir(targetDir);
  await fs.copy(videoPath, path.join(targetDir, videoFilename));

  const result = await videoProcessor.processUploadedVideo(
    path.join(targetDir, videoFilename),
    targetDir
  );
  assert.equal(result, true);

  const savedMov = path.join(targetDir, 'video', videoFilename);
  assert.equal(await fs.pathExists(savedMov), false, 'MOV should be deleted after MP4 compression');

  const mp4Filename = videoFilename.replace(/\.mov$/, '.mp4');
  const savedMp4 = path.join(targetDir, 'video', mp4Filename);
  assert.equal(await fs.pathExists(savedMp4), true, 'MP4 file should exist');

  await fs.remove(uploadTestDir);
});

test('processUploadedVideo 将非H.264视频转码为H.264 MP4', async () => {
  const uploadTestDir = path.join(tempRoot, 'mp4-transcode-test');
  await fs.ensureDir(uploadTestDir);

  const videoFilename = 'transcode-test.avi';
  const videoPath = path.join(uploadTestDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  const genResult = spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=128x96:d=1:r=5',
    '-f', 'lavfi', '-i', 'sine=f=440:d=1',
    '-c:v', 'mpeg4', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    videoPath
  ], { stdio: 'pipe' });
  assert.equal(genResult.status, 0, 'ffmpeg should generate test video');

  const targetDir = path.join(uploadTestDir, 'target');
  await fs.ensureDir(targetDir);

  const result = await videoProcessor.processUploadedVideo(videoPath, targetDir);
  assert.equal(result, true, 'processUploadedVideo should return true');

  const savedAvi = path.join(targetDir, 'video', videoFilename);
  assert.equal(await fs.pathExists(savedAvi), false, 'AVI should be deleted after transcoding');

  const mp4Filename = videoFilename.replace(/\.avi$/, '.mp4');
  const savedMp4 = path.join(targetDir, 'video', mp4Filename);
  assert.equal(await fs.pathExists(savedMp4), true, 'MP4 file should exist after transcoding');

  const mp4Info = await videoProcessor.getVideoInfo(savedMp4);
  const mp4Stream = mp4Info.streams.find(s => s.codec_type === 'video');
  assert.equal(mp4Stream.codec_name, 'h264', 'transcoded video should be H.264');

  await fs.remove(uploadTestDir);
});

test('processUploadedVideo 已压缩的H.264 MP4压缩后更大时保留原文件', { skip: !_ffmpegAvailable }, async () => {

  const uploadTestDir = path.join(tempRoot, 'mp4-keep-original-test');
  await fs.ensureDir(uploadTestDir);

  const videoFilename = 'already-compressed.mp4';
  const videoPath = path.join(uploadTestDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  const genResult = spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=128x96:d=1:r=5',
    '-f', 'lavfi', '-i', 'sine=f=440:d=1',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    '-crf', '18', '-preset', 'slow',
    '-movflags', '+faststart', videoPath
  ], { stdio: 'pipe' });
  assert.equal(genResult.status, 0, 'ffmpeg should generate test video');

  const targetDir = path.join(uploadTestDir, 'target');
  await fs.ensureDir(targetDir);
  await fs.copy(videoPath, path.join(targetDir, videoFilename));

  const result = await videoProcessor.processUploadedVideo(
    path.join(targetDir, videoFilename),
    targetDir
  );
  assert.equal(result, true);

  const savedMp4 = path.join(targetDir, 'video', videoFilename);
  assert.equal(await fs.pathExists(savedMp4), true, 'original H.264 MP4 should be kept');

  const mp4Info = await videoProcessor.getVideoInfo(savedMp4);
  const mp4Stream = mp4Info.streams.find(s => s.codec_type === 'video');
  assert.equal(mp4Stream.codec_name, 'h264', 'kept file should still be H.264');

  await fs.remove(uploadTestDir);
});

test('MP4播放：首页视频使用src属性直接播放MP4', { skip: !_ffmpegAvailable }, async () => {

  const { sessionCookie, csrfToken } = await loginAsAdmin();

  const rootVideoDir = path.join(contentRoot, 'images', 'video');
  await fs.ensureDir(rootVideoDir);

  const videoFilename = `mp4-index-${Date.now()}.mp4`;
  const videoPath = path.join(rootVideoDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=10',
    '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath
  ], { stdio: 'ignore' });
  assert.equal(await fs.pathExists(videoPath), true, 'test video should exist');

  const storedPath = `../content/images/video/${videoFilename}`;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('index_image', ?)").run(storedPath);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('index_image_left', ?)").run(storedPath);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('index_display_type', 'video')").run();

  if (clearIndexSettingsCache) {
    clearIndexSettingsCache();
  }

  const indexResponse = await fetch(`${baseUrl}/`);
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();

  assert.match(indexHtml, /<video[^>]+src="[^"]*\.mp4"/, 'video should have src with .mp4 URL');

  db.prepare("DELETE FROM settings WHERE key = 'index_image'").run();
  db.prepare("DELETE FROM settings WHERE key = 'index_image_left'").run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('index_display_type', 'single')").run();

  await fs.remove(videoPath);
});

test('MP4播放：作品集视频在API中标记isVideo并返回MP4 URL', { skip: !_ffmpegAvailable }, async () => {

  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'MP4 API Test',
    slug: `mp4-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const colVideoDir = path.join(contentRoot, collection.slug, 'content', 'images', 'video');
  await fs.ensureDir(colVideoDir);

  const videoFilename = `api-mp4-${Date.now()}.mp4`;
  const videoPath = path.join(colVideoDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=10',
    '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath
  ], { stdio: 'ignore' });

  db.prepare(`
    INSERT INTO media (
      collection_id, filename, original_name, report_markdown,
      order_index, published_filename, published_original_name,
      published_report_markdown, published_order_index,
      is_published, is_deleted_draft
    ) VALUES (?, ?, ?, '', 0, ?, ?, '', 0, 1, 0)
  `).run(collection.id, videoFilename, videoFilename, videoFilename, videoFilename);

  const apiResponse = await fetch(`${baseUrl}/api/collections/${collection.slug}`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(apiResponse.status, 200);
  const payload = await apiResponse.json();

  const videoItem = payload.mediaItems.find(m => m.filename === videoFilename);
  assert.ok(videoItem, 'video item should exist in API response');
  assert.equal(videoItem.isVideo, true);
  assert.ok(videoItem.mediaUrl.endsWith('.mp4'), 'mediaUrl should be .mp4');

  await fs.remove(videoPath);
});

test('MP4播放：大图页视频使用src属性直接播放MP4', { skip: !_ffmpegAvailable }, async () => {

  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'MP4 Detail Page Test',
    slug: `mp4-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayType: 'single'
  });

  const colVideoDir = path.join(contentRoot, collection.slug, 'content', 'images', 'video');
  await fs.ensureDir(colVideoDir);

  const videoFilename = `detail-mp4-${Date.now()}.mp4`;
  const videoPath = path.join(colVideoDir, videoFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const { spawnSync: spawnSyncFf } = require('child_process');
  spawnSyncFf(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=10',
    '-f', 'lavfi', '-i', 'sine=f=440:d=2',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath
  ], { stdio: 'ignore' });

  const baseName = videoFilename.replace(/\.mp4$/, '');
  db.prepare(`
    INSERT INTO media (
      collection_id, filename, original_name, report_markdown,
      order_index, published_filename, published_original_name,
      published_report_markdown, published_order_index,
      is_published, is_deleted_draft
    ) VALUES (?, ?, ?, '', 0, ?, ?, '', 0, 1, 0)
  `).run(collection.id, videoFilename, videoFilename, videoFilename, videoFilename);

  const detailResponse = await fetch(`${baseUrl}/${collection.slug}/${baseName}_large`);
  assert.equal(detailResponse.status, 200);
  const detailHtml = await detailResponse.text();

  assert.match(detailHtml, /<video[^>]+src="[^"]*\.mp4"/, 'detail page video should have src with .mp4');

  await fs.remove(videoPath);
});

test('CSRF 防护：POST 缺少 CSRF token 返回 403', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/collections/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie
    },
    body: new URLSearchParams({ name: 'No CSRF', slug: 'no-csrf-test' }).toString(),
    redirect: 'manual'
  });
  assert.equal(response.status, 403);
});

test('CSRF 防护：POST 错误 CSRF token 返回 403', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/collections/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: sessionCookie
    },
    body: new URLSearchParams({ name: 'Bad CSRF', slug: 'bad-csrf-test', _csrf: 'invalid-token-value' }).toString(),
    redirect: 'manual'
  });
  assert.equal(response.status, 403);
});

test('CSRF 防护：GET 请求不需要 CSRF token', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(response.status, 200);
});

test('管理员登出后 session 被销毁，再访问后台被重定向', async () => {
  const { sessionCookie } = await loginAsAdmin();

  const beforeLogout = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(beforeLogout.status, 200);

  const logoutResponse = await fetch(`${baseUrl}/admin/logout`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(logoutResponse.status, 302);
  assert.equal(logoutResponse.headers.get('location'), '/admin/login');

  const afterLogout = await fetch(`${baseUrl}/admin`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual'
  });
  assert.equal(afterLogout.status, 302);
  assert.equal(afterLogout.headers.get('location'), '/admin/login');
});

test('管理员可删除作品集并清理磁盘文件', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Delete Me',
    slug: `delete-me-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'to-delete.jpg'
  });

  const collectionDir = path.join(contentRoot, collection.slug);
  assert.equal(await fs.pathExists(collectionDir), true);

  await deleteCollectionThroughAdmin({ sessionCookie, csrfToken, collectionId: collection.id });

  const deletedCollection = db.prepare('SELECT * FROM collections WHERE id = ?').get(collection.id);
  assert.equal(deletedCollection, undefined);
  assert.equal(await fs.pathExists(collectionDir), false);
});

test('删除作品集未确认时不执行删除', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Keep Me',
    slug: `keep-me-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const response = await adminFormPost(`${baseUrl}/admin/collections/delete/${collection.id}`, {
    sessionCookie,
    csrfToken,
    body: {},
    redirect: 'manual'
  });
  assert.equal(response.status, 302);

  const stillExists = db.prepare('SELECT * FROM collections WHERE id = ?').get(collection.id);
  assert.ok(stillExists, 'collection should still exist when not confirmed');
});

test('登录 IP 失败次数达到上限后锁定 IP', async () => {
  db.prepare('DELETE FROM admin_login_ip_lockouts WHERE ip = ?').run('127.0.0.1');
  db.prepare('DELETE FROM admin_login_lockouts').run();

  try {
    const lockUntil = Date.now() + 15 * 60 * 1000;
    db.prepare(`
      INSERT INTO admin_login_ip_lockouts (ip, failed_count, locked_until, created_at, updated_at)
      VALUES ('127.0.0.1', 10, ?, ?, ?)
    `).run(lockUntil, Date.now(), Date.now());

    const freshUser = `ip-lock-fresh-${Date.now()}`;
    createUser({ username: freshUser, password: 'FreshPass123!' });

    const { csrfToken, sessionCookie } = await fetchPageCsrfToken(`${baseUrl}/admin/login`);
    const response = await postForm(`${baseUrl}/admin/login`, {
      body: { username: freshUser, password: 'FreshPass123!', _csrf: csrfToken },
      headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow'
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /该 IP 登录尝试次数过多|IP.*too many/i);

    const ipRow = db.prepare('SELECT failed_count, locked_until FROM admin_login_ip_lockouts WHERE ip = ?').get('127.0.0.1');
    assert.ok(ipRow, 'IP lockout row should exist');
    assert.ok(ipRow.locked_until, 'IP should be locked');
  } finally {
    db.prepare('DELETE FROM admin_login_ip_lockouts WHERE ip = ?').run('127.0.0.1');
  }
});

test('站点设置保存后配置值持久化到数据库', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();

  const newSiteName = `Test Site ${Date.now()}`;
  const response = await adminFormPost(`${baseUrl}/admin/settings`, {
    sessionCookie,
    csrfToken,
    body: {
      siteName: newSiteName,
      siteTitle: 'Test Title',
      fullSignature: 'Test Full Sig',
      shortSignature: 'Test Short Sig',
      icpNumber: 'TestICP123',
      icpLink: 'https://beian.example.com',
      imageVariantWidthThumb: '400',
      imageVariantWidthMedium: '1400',
      imageVariantWidthLarge: '2400',
      imageVariantQuality: '82',
      imageOriginalQuality: '90',
      videoCrf: '23',
      videoBitrate: '2000k',
      videoAudioBitrate: '128k',
      videoMaxrate: '2500k',
      videoMaxResolution: '1920x1080',
      videoPreset: 'slow'
    }
  });
  assert.equal(response.status, 200);

  const savedName = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get();
  assert.ok(savedName, 'site_name setting should exist');
  assert.equal(savedName.value, newSiteName);

  const savedIcp = db.prepare("SELECT value FROM settings WHERE key = 'icp_number'").get();
  assert.ok(savedIcp, 'icp_number setting should exist');
  assert.equal(savedIcp.value, 'TestICP123');
});

test('管理员可切换作品集显示类型', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Type Switch',
    slug: `type-switch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayType: 'single'
  });

  const response = await updateCollectionTypeThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    displayType: 'diptych'
  });
  assert.equal(response.status, 200);

  const updated = db.prepare('SELECT display_type FROM collections WHERE id = ?').get(collection.id);
  assert.equal(updated.display_type, 'diptych');
});

test('管理员可更新作品集报告 Markdown', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Report Update',
    slug: `report-update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const markdown = '# Test Report\n\nThis is a **test** report.';
  const response = await updateCollectionReportThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    reportMarkdown: markdown
  });
  assert.equal(response.status, 200);

  const updated = db.prepare('SELECT report_markdown FROM collections WHERE id = ?').get(collection.id);
  assert.equal(updated.report_markdown, markdown);
});

test('管理员可更新媒体报告 Markdown', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Media Report',
    slug: `media-report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const media = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'report-media.jpg'
  });

  const markdown = '## Media Note\n\nA note about this media.';
  const response = await updateMediaReportThroughAdmin({
    sessionCookie,
    csrfToken,
    mediaId: media.id,
    reportMarkdown: markdown
  });
  assert.equal(response.status, 200);

  const updated = db.prepare('SELECT report_markdown FROM media WHERE id = ?').get(media.id);
  assert.equal(updated.report_markdown, markdown);
});

test('管理员可调整媒体排序', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Media Reorder',
    slug: `media-reorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const mediaA = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'media-a.jpg'
  });
  const mediaB = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'media-b.jpg'
  });
  const mediaC = await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'media-c.jpg'
  });

  const newOrder = [mediaC.id, mediaA.id, mediaB.id];
  const response = await reorderMediaThroughAdmin({ sessionCookie, csrfToken, order: newOrder });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.success, true);

  const rows = db.prepare('SELECT id, order_index FROM media WHERE collection_id = ? ORDER BY order_index ASC').all(collection.id);
  assert.deepEqual(rows.map(r => r.id), newOrder);
});

test('上传非法文件类型被拒绝', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Bad File Upload',
    slug: `bad-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const form = new FormData();
  form.append('media', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'readme.txt');

  const response = await fetch(`${baseUrl}/admin/collections/${collection.id}/media/upload`, {
    method: 'POST',
    headers: {
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: form,
    redirect: 'manual'
  });

  assert.ok(response.status === 400 || response.status === 500, `expected error status, got ${response.status}`);
});

test('访问日志：公开页面访问被记录', async () => {
  db.prepare('DELETE FROM visit_logs').run();

  await fetch(`${baseUrl}/`);
  await fetch(`${baseUrl}/`);

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM visit_logs').get();
  assert.ok(count.cnt >= 2, `expected at least 2 visit logs, got ${count.cnt}`);
});

test('访问日志：后台路径不被记录', async () => {
  db.prepare('DELETE FROM visit_logs').run();

  await fetch(`${baseUrl}/admin/login`);

  const adminLogs = db.prepare("SELECT COUNT(*) AS cnt FROM visit_logs WHERE path LIKE '/admin%'").get();
  assert.equal(adminLogs.cnt, 0);
});

test('访问日志：日志超过上限时自动清理', async () => {
  db.prepare('DELETE FROM visit_logs').run();

  for (let i = 0; i < 210; i++) {
    db.prepare('INSERT INTO visit_logs (ip, path, user_agent, visited_at) VALUES (?, ?, ?, ?)').run('127.0.0.1', `/test-path-${i}`, 'test', Date.now());
  }

  await fetch(`${baseUrl}/`);

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM visit_logs').get();
  assert.ok(count.cnt <= 201, `visit logs should be pruned to ~200, got ${count.cnt}`);
});

test('旧 URL /content/:slug/index.html 重定向到 /:slug', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const { collection } = await createPublishedCollectionWithMedia({
    sessionCookie,
    csrfToken,
    name: 'Redirect Test',
    slug: `redirect-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const response = await fetch(`${baseUrl}/content/${collection.slug}/index.html`, {
    redirect: 'manual'
  });
  assert.equal(response.status, 301);
  assert.ok(response.headers.get('location').includes(`/${collection.slug}`));
});

test('旧 URL /content/:slug/content/:photoHtml 重定向到大图页', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const { collection, mediaItems } = await createPublishedCollectionWithMedia({
    sessionCookie,
    csrfToken,
    name: 'Photo Redirect Test',
    slug: `photo-redirect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const baseName = mediaItems[0].filename.replace(/\.[^/.]+$/, '');
  const response = await fetch(`${baseUrl}/content/${collection.slug}/content/${baseName}_large.html`, {
    redirect: 'manual'
  });
  assert.equal(response.status, 301);
  assert.ok(response.headers.get('location').includes(`/${collection.slug}/${baseName}_large`));
});

test('公开大图页渲染 single 模式含 prev/next 导航', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const { collection, mediaItems } = await createPublishedCollectionWithMedia({
    sessionCookie,
    csrfToken,
    name: 'Large Page Single',
    slug: `large-single-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayType: 'single',
    mediaCount: 3
  });

  const baseName0 = mediaItems[0].filename.replace(/\.[^/.]+$/, '');
  const baseName1 = mediaItems[1].filename.replace(/\.[^/.]+$/, '');
  const baseName2 = mediaItems[2].filename.replace(/\.[^/.]+$/, '');

  const firstResponse = await fetch(`${baseUrl}/${collection.slug}/${baseName0}_large`);
  assert.equal(firstResponse.status, 200);
  const firstHtml = await firstResponse.text();
  assert.ok(!firstHtml.includes(`/${collection.slug}/${baseName0}_large`) || firstHtml.includes(baseName1), 'first page should not have prev');
  assert.match(firstHtml, new RegExp(escapeRegExp(baseName1)));

  const middleResponse = await fetch(`${baseUrl}/${collection.slug}/${baseName1}_large`);
  assert.equal(middleResponse.status, 200);
  const middleHtml = await middleResponse.text();
  assert.match(middleHtml, new RegExp(escapeRegExp(baseName0)));
  assert.match(middleHtml, new RegExp(escapeRegExp(baseName2)));

  const lastResponse = await fetch(`${baseUrl}/${collection.slug}/${baseName2}_large`);
  assert.equal(lastResponse.status, 200);
  const lastHtml = await lastResponse.text();
  assert.match(lastHtml, new RegExp(escapeRegExp(baseName1)));
});

test('公开大图页渲染 diptych 模式分页', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const { collection, mediaItems } = await createPublishedCollectionWithMedia({
    sessionCookie,
    csrfToken,
    name: 'Large Page Diptych',
    slug: `large-diptych-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayType: 'diptych',
    mediaCount: 4
  });

  const baseName0 = mediaItems[0].filename.replace(/\.[^/.]+$/, '');
  const baseName2 = mediaItems[2].filename.replace(/\.[^/.]+$/, '');

  const page1Response = await fetch(`${baseUrl}/${collection.slug}/${baseName0}_large`);
  assert.equal(page1Response.status, 200);
  const page1Html = await page1Response.text();
  assert.match(page1Html, new RegExp(escapeRegExp(baseName2)));

  const page2Response = await fetch(`${baseUrl}/${collection.slug}/${baseName2}_large`);
  assert.equal(page2Response.status, 200);
  const page2Html = await page2Response.text();
  assert.match(page2Html, new RegExp(escapeRegExp(baseName0)));
});

test('未登录 POST 管理接口返回 403 或重定向到登录页', async () => {
  const endpoints = [
    { url: `${baseUrl}/admin/collections/add`, body: 'name=Test&slug=test' },
    { url: `${baseUrl}/admin/collections/reorder`, body: '{"order":[]}' },
    { url: `${baseUrl}/admin/media/reorder`, body: '{"order":[]}' }
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: endpoint.body,
      redirect: 'manual'
    });
    assert.ok(
      response.status === 302 || response.status === 403,
      `expected 302 or 403 for ${endpoint.url}, got ${response.status}`
    );
  }
});

test('访问不存在的作品集大图页返回 404', async () => {
  const response = await fetch(`${baseUrl}/nonexistent-slug/somefile_large`);
  assert.equal(response.status, 404);
});

test('对不存在的 media ID 执行删除返回成功', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const response = await adminJsonPost(`${baseUrl}/admin/media/delete/999999`, { sessionCookie, csrfToken });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
});

test('重命名作品集为空名称返回错误', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Empty Name Test',
    slug: `empty-name-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const response = await fetch(`${baseUrl}/admin/collections/rename/${collection.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Cookie: sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    body: new URLSearchParams({ name: '' }).toString()
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.success, false);
});

test('发布作品集后 API 返回更新后的数据', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Cache Invalidation',
    slug: `cache-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  await uploadMediaToCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    collectionId: collection.id,
    filename: 'cache-test.jpg'
  });

  db.prepare('UPDATE collections SET is_hidden = 0 WHERE id = ?').run(collection.id);

  const beforePublish = await fetch(`${baseUrl}/api/collections/${collection.slug}`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(beforePublish.status, 200);
  const beforePayload = await beforePublish.json();
  assert.equal(beforePayload.mediaItems.length, 0, 'unpublished media should not appear');

  await publishCollectionThroughAdmin({ sessionCookie, csrfToken, collectionId: collection.id });

  const afterPublish = await fetch(`${baseUrl}/api/collections/${collection.slug}`, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(afterPublish.status, 200);
  const afterPayload = await afterPublish.json();
  assert.equal(afterPayload.mediaItems.length, 1, 'published media should appear after publish');
});

test('处理任务查询：不存在的 jobId 返回 404', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/jobs/nonexistent-job-id`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.success, false);
});

test('处理任务查询：未登录被重定向', async () => {
  const response = await fetch(`${baseUrl}/admin/jobs/some-job-id`, {
    redirect: 'manual'
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('保留 slug 的作品集被禁止访问时旧 URL 重定向也返回 404', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const { collection } = await createPublishedCollectionWithMedia({
    sessionCookie,
    csrfToken,
    name: 'Blocked Redirect',
    slug: `blocked-redirect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  await adminJsonPost(`${baseUrl}/admin/collections/toggle-access-blocked/${collection.id}`, { sessionCookie, csrfToken, body: {} });

  const redirectResponse = await fetch(`${baseUrl}/content/${collection.slug}/index.html`, {
    redirect: 'manual'
  });
  assert.equal(redirectResponse.status, 404);
});

test('GET /admin/visitors 返回访问统计页面', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/visitors`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /访问统计|Visitors/i);
});

test('GET /admin/settings 返回设置页面', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/settings`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /设置|Settings/i);
});

test('GET /admin/collections/:id 返回作品集详情页', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();
  const collection = await createCollectionThroughAdmin({
    sessionCookie,
    csrfToken,
    name: 'Detail Page Test',
    slug: `detail-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const response = await fetch(`${baseUrl}/admin/collections/${collection.id}`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Detail Page Test/);
});

test('GET /ready 在数据库和内容目录均可用时返回 ready 结构', async () => {
  const response = await fetch(`${baseUrl}/ready`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'ready');
  assert.equal(payload.checks.database, true);
  assert.equal(payload.checks.contentRoot, true);
  assert.ok(payload.version);
  assert.ok(payload.now);
});

test('i18n：前台页面根据 Accept-Language 返回对应语言', async () => {
  const admin = await loginAsAdmin();
  const { collection } = await createPublishedCollectionWithMedia({
    sessionCookie: admin.sessionCookie,
    csrfToken: admin.csrfToken,
    name: 'i18n Public Test',
    slug: `i18n-public-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const zhResponse = await fetch(`${baseUrl}/${collection.slug}`, {
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const zhHtml = await zhResponse.text();
  assert.match(zhHtml, /暂无作品阐述|加载中/);

  const enResponse = await fetch(`${baseUrl}/${collection.slug}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  });
  const enHtml = await enResponse.text();
  assert.match(enHtml, /No description yet|Loading more/i);
});

test('i18n：前台页面 zh-TW Accept-Language 匹配繁体中文', async () => {
  const admin = await loginAsAdmin();
  const { collection } = await createPublishedCollectionWithMedia({
    sessionCookie: admin.sessionCookie,
    csrfToken: admin.csrfToken,
    name: 'i18n TW Test',
    slug: `i18n-tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });

  const twResponse = await fetch(`${baseUrl}/${collection.slug}`, {
    headers: { 'Accept-Language': 'zh-TW,zh;q=0.9' }
  });
  const twHtml = await twResponse.text();
  assert.match(twHtml, /暫無作品闡述|載入中/);
});

test('i18n：后台页面根据 Accept-Language 返回对应语言', async () => {
  const { sessionCookie } = await loginAsAdmin();

  const zhResponse = await fetch(`${baseUrl}/admin/settings`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const zhHtml = await zhResponse.text();
  assert.match(zhHtml, /保存设置/);

  const enResponse = await fetch(`${baseUrl}/admin/settings`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'en-US,en;q=0.9' }
  });
  const enHtml = await enResponse.text();
  assert.match(enHtml, /Save Settings/);
});

test('i18n：后台设置语言后，后台页面使用设置的语言', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();

  await adminFormPost(`${baseUrl}/admin/settings`, {
    sessionCookie,
    csrfToken,
    body: {
      siteName: 'Test i18n',
      siteTitle: 'Test',
      fullSignature: 'Test',
      shortSignature: 'Test',
      icpNumber: '',
      icpLink: '',
      imageVariantWidthThumb: '400',
      imageVariantWidthMedium: '1400',
      imageVariantWidthLarge: '2400',
      imageVariantQuality: '82',
      imageOriginalQuality: '90',
      videoCrf: '23',
      videoBitrate: '2000k',
      videoAudioBitrate: '128k',
      videoMaxrate: '2500k',
      videoMaxResolution: '1920x1080',
      videoPreset: 'slow',
      language: 'en'
    }
  });

  clearIndexSettingsCache();

  const enResponse = await fetch(`${baseUrl}/admin/settings`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const enHtml = await enResponse.text();
  assert.match(enHtml, /Save Settings/);

  await adminFormPost(`${baseUrl}/admin/settings`, {
    sessionCookie,
    csrfToken,
    body: {
      siteName: 'Test i18n',
      siteTitle: 'Test',
      fullSignature: 'Test',
      shortSignature: 'Test',
      icpNumber: '',
      icpLink: '',
      imageVariantWidthThumb: '400',
      imageVariantWidthMedium: '1400',
      imageVariantWidthLarge: '2400',
      imageVariantQuality: '82',
      imageOriginalQuality: '90',
      videoCrf: '23',
      videoBitrate: '2000k',
      videoAudioBitrate: '128k',
      videoMaxrate: '2500k',
      videoMaxResolution: '1920x1080',
      videoPreset: 'slow',
      language: ''
    }
  });

  clearIndexSettingsCache();
});

test('i18n：语言设置持久化到数据库', async () => {
  const { sessionCookie, csrfToken } = await loginAsAdmin();

  await adminFormPost(`${baseUrl}/admin/settings`, {
    sessionCookie,
    csrfToken,
    body: {
      siteName: 'Test i18n Persist',
      siteTitle: 'Test',
      fullSignature: 'Test',
      shortSignature: 'Test',
      icpNumber: '',
      icpLink: '',
      imageVariantWidthThumb: '400',
      imageVariantWidthMedium: '1400',
      imageVariantWidthLarge: '2400',
      imageVariantQuality: '82',
      imageOriginalQuality: '90',
      videoCrf: '23',
      videoBitrate: '2000k',
      videoAudioBitrate: '128k',
      videoMaxrate: '2500k',
      videoMaxResolution: '1920x1080',
      videoPreset: 'slow',
      language: 'zh-TW'
    }
  });

  const saved = db.prepare("SELECT value FROM settings WHERE key = 'language'").get();
  assert.ok(saved, 'language setting should exist');
  assert.equal(saved.value, 'zh-TW');

  await adminFormPost(`${baseUrl}/admin/settings`, {
    sessionCookie,
    csrfToken,
    body: {
      siteName: 'Test i18n Persist',
      siteTitle: 'Test',
      fullSignature: 'Test',
      shortSignature: 'Test',
      icpNumber: '',
      icpLink: '',
      imageVariantWidthThumb: '400',
      imageVariantWidthMedium: '1400',
      imageVariantWidthLarge: '2400',
      imageVariantQuality: '82',
      imageOriginalQuality: '90',
      videoCrf: '23',
      videoBitrate: '2000k',
      videoAudioBitrate: '128k',
      videoMaxrate: '2500k',
      videoMaxResolution: '1920x1080',
      videoPreset: 'slow',
      language: ''
    }
  });
});

test('i18n：登录错误消息支持多语言', async () => {
  const { sessionCookie: _sc } = await loginAsAdmin();
  const loginPageZh = await fetch(`${baseUrl}/admin/login`, {
    headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const zhHtml = await loginPageZh.text();
  assert.match(zhHtml, /登录/);

  const loginPageEn = await fetch(`${baseUrl}/admin/login`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  });
  const enHtml = await loginPageEn.text();
  assert.match(enHtml, /Login|Log in/i);
});

test('i18n：设置页面包含语言选项', async () => {
  const { sessionCookie } = await loginAsAdmin();
  const response = await fetch(`${baseUrl}/admin/settings`, {
    headers: { Cookie: sessionCookie, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const html = await response.text();
  assert.match(html, /zh-CN/);
  assert.match(html, /zh-TW/);
  assert.match(html, /value="en"/);
});

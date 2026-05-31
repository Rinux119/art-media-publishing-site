const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const net = require('net');
const { pipeline } = require('stream');
const { promisify } = require('util');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const helmet = require('helmet');

const packageMeta = require('./package.json');
const { ensureEnvFile } = require('./lib/setup');
ensureEnvFile(__dirname);
const { loadEnvFiles, resolveContentRoot } = require('./lib/runtime-config');
loadEnvFiles({ baseDir: __dirname });
const db = require('./db');
const videoProcessor = require('./videoProcessor');
const { wantsJson, renderUploadError, createUploadMiddlewareErrorHandler, createArrayUploadRunner } = require('./lib/http-utils');
const { csrfMiddleware } = require('./lib/csrf');
const { createSessionStore } = require('./lib/session-store');
const { createMediaPathHelpers } = require('./lib/media-paths');
const { createMediaRequestHandler } = require('./lib/media-response');
const { createProcessingRuntime } = require('./lib/processing-runtime');
const { CACHE_SECONDS, MEDIA_CACHE_POLICY, setCacheControl, createCacheUtilities } = require('./lib/cache-utils');
const { createImageVariantService } = require('./lib/image-variants');
const { createVisitLogger } = require('./lib/visit-logger');
const { i18nMiddleware, getCatalog, SUPPORTED_LOCALES } = require('./lib/i18n');
const { loadSiteConfig } = require('./config');
const {
    calculateProcessingSteps,
    cleanupUploadedTempFiles,
    ensureVideoProcessingAvailableForFiles,
    enqueueRootMediaPostProcessing,
    enqueueCollectionMediaPostProcessing
} = require('./lib/admin-media');
const { createPublicSiteHelpers, markedReady } = require('./lib/public-site');
const { createAssetHelpers } = require('./lib/asset-utils');
const { createServerLifecycle } = require('./lib/server-lifecycle');
const { registerPublicRoutes: _registerPublicRoutes } = require('./routes/public');
let clearIndexSettingsCache = null;
const { registerAdminRoutes } = require('./routes/admin');

const app = express();
const APP_VERSION = packageMeta.version || '0.0.0';
const appStartTime = Date.now();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');

if (process.env.TRUST_PROXY) {
    const trustProxyRaw = String(process.env.TRUST_PROXY).trim().toLowerCase();
    if (trustProxyRaw === 'true') app.set('trust proxy', 1);
    else if (trustProxyRaw === 'false') app.set('trust proxy', false);
    else if (!Number.isNaN(Number(trustProxyRaw))) app.set('trust proxy', Number(trustProxyRaw));
} else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const cdnUrl = process.env.CDN_URL || '';
const cdnOrigin = cdnUrl ? new URL(cdnUrl).origin : null;

app.use(helmet({
    hsts: process.env.NODE_ENV === 'production',
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", ...(cdnOrigin ? [cdnOrigin] : [])],
            mediaSrc: ["'self'", "blob:", ...(cdnOrigin ? [cdnOrigin] : [])],
            fontSrc: ["'self'"],
            connectSrc: ["'self'", ...(cdnOrigin ? [cdnOrigin] : [])],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    }
}));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'art-media-publishing-site-default-secret',
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(db),
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));
app.use((req, res, next) => {
    const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0].trim().toLowerCase()
        : '';
    const isHttps = req.secure || forwardedProto === 'https';
    if (req.session && req.session.cookie) {
        req.session.cookie.secure = isHttps;
    }
    next();
});

app.use(csrfMiddleware);

const {
    getRecentVisits,
    getVisitsSorted,
    getVisitStats,
    visitLoggerMiddleware
} = createVisitLogger({ db });
app.use(visitLoggerMiddleware);

const pipelineAsync = promisify(pipeline);
const {
    sharpInputOptions: SHARP_INPUT_OPTIONS,
    withImageProcessing,
    enqueueBackgroundImageTask,
    enqueueBackgroundVideoTask,
    getProcessingJob,
    createProcessingJob,
    bumpProcessingJob
} = createProcessingRuntime({ sharp });
const {
    dataCache,
    assetVersionCache,
    invalidateCachedData,
    sendJsonWithCache,
    sendHtmlWithCache
} = createCacheUtilities();

app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/admin')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return next();
    }
    if (req.path.startsWith('/content') || req.path.startsWith('/resources')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return next();
});

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv']);
const IMAGE_VARIANT_SIZES = ['thumb', 'medium', 'large', 'original'];
const MAX_UPLOAD_FILE_SIZE_BYTES = 300 * 1024 * 1024;

const CONTENT_ROOT = resolveContentRoot({ baseDir: __dirname });
const {
    isSafePathSegment,
    getCollectionImagesRootDir,
    getCollectionMediaDir,
    getRootImagesDir,
    getCollectionMediaUrl,
    getRootMediaUrl,
    removeCollectionMediaAssets,
    removeRootMediaAssets
} = createMediaPathHelpers({ contentRoot: CONTENT_ROOT, fs, path, cdnUrl });

const getFileExt = (filename = '') => path.extname(filename).toLowerCase();
const isImageFile = (filename = '') => IMAGE_EXTENSIONS.has(getFileExt(filename));
const isVideoFile = (filename = '') => VIDEO_EXTENSIONS.has(getFileExt(filename));
const isSupportedImageVariantSize = (size) => IMAGE_VARIANT_SIZES.includes(size);

const {
    normalizeCollectionDisplayType,
    renderMarkdown,
    resolveCollectionImageUrlByPreference,
    resolveRootImageUrlByPreference,
    resolveIndexStoredPathForView,
    mapMediaForCollection,
    toPublicCollection,
    isCollectionAccessBlocked
} = createPublicSiteHelpers({
    fs,
    path,
    isVideoFile,
    isImageFile,
    isSupportedImageVariantSize,
    getCollectionMediaDir,
    getCollectionMediaUrl,
    getRootImagesDir,
    getRootMediaUrl,
    cdnUrl
});

const {
    assetUrl,
    guessStrongCachePolicyForFilePath
} = createAssetHelpers({
    fs,
    path,
    baseDir: __dirname,
    contentRoot: CONTENT_ROOT,
    assetVersionCache,
    getFileExt,
    imageExtensions: IMAGE_EXTENSIONS,
    videoExtensions: VIDEO_EXTENSIONS,
    cacheSeconds: CACHE_SECONDS
});

app.use((req, res, next) => {
    res.locals.assetUrl = assetUrl;
    next();
});

let _siteConfigCache = null;
let _siteConfigCacheTime = 0;
const SITE_CONFIG_CACHE_TTL = 10_000;

app.use((req, res, next) => {
    const now = Date.now();
    if (!_siteConfigCache || (now - _siteConfigCacheTime) > SITE_CONFIG_CACHE_TTL) {
        _siteConfigCache = loadSiteConfig(db);
        _siteConfigCacheTime = now;
    }
    res.locals.siteConfig = _siteConfigCache;
    next();
});

app.use(i18nMiddleware);

app.get('/@vite/client', (req, res) => {
    res.type('application/javascript').status(204).end();
});

function invalidateSiteConfigCache() {
    _siteConfigCache = null;
    _siteConfigCacheTime = 0;
}

function getMediaConfig() {
    const config = _siteConfigCache || loadSiteConfig(db);
    const [maxWidth, maxHeight] = (config.videoMaxResolution || '1920x1080').split('x').map(Number);
    return {
        imageVariantMaxWidth: {
            thumb: config.imageVariantWidthThumb,
            medium: config.imageVariantWidthMedium,
            large: config.imageVariantWidthLarge
        },
        imageVariantQuality: config.imageVariantQuality,
        imageOriginalQuality: config.imageOriginalQuality,
        videoCrf: config.videoCrf,
        videoBitrate: config.videoBitrate,
        videoAudioBitrate: config.videoAudioBitrate,
        videoMaxrate: config.videoMaxrate,
        videoMaxWidth: maxWidth,
        videoMaxHeight: maxHeight,
        videoPreset: config.videoPreset
    };
}

const {
    compressOriginalImageInPlace,
    withGenerationLock,
    generateImageVariant,
    ensureCollectionImageVariants,
    ensureRootImageVariants
} = createImageVariantService({
    fs,
    path,
    sharp,
    pipelineAsync,
    withImageProcessing,
    getCollectionMediaDir,
    getRootImagesDir,
    getFileExt,
    isImageFile,
    getMediaConfig,
    sharpInputOptions: SHARP_INPUT_OPTIONS
});

videoProcessor.updateMediaConfig(getMediaConfig());

const { createUploadConfig } = require('./lib/upload');
const { storage, upload } = createUploadConfig({
    multer,
    fs,
    path,
    getFileExt,
    imageExtensions: IMAGE_EXTENSIONS,
    videoExtensions: VIDEO_EXTENSIONS,
    maxUploadFileSizeBytes: MAX_UPLOAD_FILE_SIZE_BYTES,
    getCollectionImagesRootDir,
    getCollectionMediaDir,
    getRootImagesDir
});
const handleUploadMiddlewareError = createUploadMiddlewareErrorHandler({ multer, renderUploadError });
const runArrayUpload = createArrayUploadRunner({ upload, handleUploadMiddlewareError });

registerAdminRoutes({
    app,
    db,
    fs,
    path,
    net,
    crypto,
    bcrypt,
    contentRoot: CONTENT_ROOT,
    dataCache,
    wantsJson,
    renderUploadError,
    runArrayUpload,
    cleanupUploadedTempFiles,
    ensureVideoProcessingAvailableForFiles,
    calculateProcessingSteps,
    enqueueRootMediaPostProcessing,
    enqueueCollectionMediaPostProcessing,
    normalizeCollectionDisplayType,
    resolveIndexStoredPathForView,
    isImageFile,
    isVideoFile,
    getProcessingJob,
    createProcessingJob,
    bumpProcessingJob,
    enqueueBackgroundImageTask,
    enqueueBackgroundVideoTask,
    ensureRootImageVariants,
    ensureCollectionImageVariants,
    compressOriginalImageInPlace,
    getCollectionImagesRootDir,
    getCollectionMediaDir,
    getRootImagesDir,
    removeCollectionMediaAssets,
    removeRootMediaAssets,
    invalidateCachedData,
    videoProcessor,
    getRecentVisits,
    getVisitsSorted,
    getVisitStats,
    invalidateSiteConfigCache,
    getMediaConfig
});

const publicRoutesResult = _registerPublicRoutes({
    app,
    db,
    fs,
    dataCache,
    sendJsonWithCache,
    sendHtmlWithCache,
    appVersion: APP_VERSION,
    appStartTime,
    contentRoot: CONTENT_ROOT,
    normalizeCollectionDisplayType,
    renderMarkdown,
    resolveIndexStoredPathForView,
    resolveCollectionImageUrlByPreference,
    resolveRootImageUrlByPreference,
    mapMediaForCollection,
    toPublicCollection,
    isCollectionAccessBlocked,
    getRootMediaUrl,
    getCollectionMediaUrl,
    isVideoFile
});

if (publicRoutesResult && typeof publicRoutesResult.clearIndexSettingsCache === 'function') {
    clearIndexSettingsCache = publicRoutesResult.clearIndexSettingsCache;
}

const applyMediaCache = (res) => setCacheControl(res, MEDIA_CACHE_POLICY);

const collectionMediaHandler = createMediaRequestHandler({
    isSafePathSegment,
    isVideoFile,
    isImageFile,
    isSupportedImageVariantSize,
    getFileExt,
    getMediaConfig,
    withImageProcessing,
    sharp,
    sharpInputOptions: SHARP_INPUT_OPTIONS,
    withGenerationLock,
    generateImageVariant,
    applyMediaCache,
    getParams: (req) => ({
        scopeKey: req.params.collectionSlug,
        size: req.params.size,
        filename: req.params.filename
    }),
    getExistingVideoPath: ({ scopeKey, filename }) => {
        const videoPath = path.join(getCollectionImagesRootDir(scopeKey), 'video', filename);
        return fs.existsSync(videoPath) ? videoPath : null;
    },
    getExistingVariantPath: ({ scopeKey, size, filename }) => {
        const filePath = path.join(getCollectionMediaDir(scopeKey, size), filename);
        return fs.existsSync(filePath) ? filePath : null;
    },
    buildVariantPath: ({ scopeKey, size, filename }) => path.join(getCollectionMediaDir(scopeKey, size), filename),
    resolveSourcePath: ({ scopeKey, filename }) => {
        const originalPath = path.join(getCollectionMediaDir(scopeKey, 'original'), filename);
        const legacyLargePath = path.join(getCollectionMediaDir(scopeKey, 'large'), filename);
        return fs.existsSync(originalPath) ? originalPath : (fs.existsSync(legacyLargePath) ? legacyLargePath : null);
    },
    getLockKey: ({ scopeKey, size, filename }) => `${scopeKey}::${size}::${filename}`
});

const rootMediaHandler = createMediaRequestHandler({
    isSafePathSegment,
    isVideoFile,
    isImageFile,
    isSupportedImageVariantSize,
    getFileExt,
    getMediaConfig,
    withImageProcessing,
    sharp,
    sharpInputOptions: SHARP_INPUT_OPTIONS,
    withGenerationLock,
    generateImageVariant,
    applyMediaCache,
    getParams: (req) => ({
        scopeKey: null,
        size: req.params.size,
        filename: req.params.filename
    }),
    getExistingVideoPath: ({ filename }) => {
        const videoPath = path.join(getRootImagesDir(), 'video', filename);
        return fs.existsSync(videoPath) ? videoPath : null;
    },
    getExistingVariantPath: ({ size, filename }) => {
        const filePath = path.join(getRootImagesDir(size), filename);
        return fs.existsSync(filePath) ? filePath : null;
    },
    buildVariantPath: ({ size, filename }) => path.join(getRootImagesDir(size), filename),
    resolveSourcePath: ({ filename }) => {
        const originalPath = path.join(getRootImagesDir('original'), filename);
        const legacyPath = path.join(getRootImagesDir(null), filename);
        const legacyLargePath = path.join(getRootImagesDir('large'), filename);
        return fs.existsSync(originalPath)
            ? originalPath
            : (fs.existsSync(legacyPath) ? legacyPath : (fs.existsSync(legacyLargePath) ? legacyLargePath : null));
    },
    getLockKey: ({ size, filename }) => `root::${size}::${filename}`
});

app.get('/content/:collectionSlug/content/images/:size/:filename', collectionMediaHandler);
app.get('/content/images/:size/:filename', rootMediaHandler);

app.use('/resources', express.static(path.join(__dirname, 'resources'), {
    setHeaders: (res, filePath) => setCacheControl(res, guessStrongCachePolicyForFilePath(res, filePath))
}));
app.use('/content', express.static(CONTENT_ROOT, {
    setHeaders: (res, filePath) => setCacheControl(res, guessStrongCachePolicyForFilePath(res, filePath))
}));

app.use((req, res) => {
    res.status(404);
    if (wantsJson(req)) {
        return res.json({ success: false, error: 'Not found' });
    }
    if (req.path && req.path.startsWith('/admin')) {
        return res.send('Not found');
    }
    return res.render('public/not-found', { collections: res.locals.collections || [] });
});

app.use((err, req, res, next) => {
    const statusCode = Number(err && (err.statusCode || err.status)) || 500;
    const message = statusCode >= 500 ? 'Internal Server Error' : (err && err.message) || 'Request failed';
    if (statusCode >= 500) {
        console.error('Unhandled request error:', err);
    }
    if (res.headersSent) return next(err);
    res.status(statusCode);
    if (wantsJson(req)) {
        return res.json({ success: false, error: message });
    }
    return res.send(message);
});

const { startServer, shutdownServer } = createServerLifecycle({
    app,
    defaultPort: port,
    logger: console
});

module.exports = {
    app,
    startServer,
    shutdownServer,
    clearIndexSettingsCache,
    markedReady
};

if (require.main === module) {
    markedReady.then(() => startServer()).catch((err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}

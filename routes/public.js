const { wantsJson } = require('../lib/http-utils');

let _dataCacheForCache = null;

const registerPublicRoutes = ({
    app,
    db,
    fs,
    dataCache,
    sendJsonWithCache,
    sendHtmlWithCache,
    appVersion,
    appStartTime,
    contentRoot,
    normalizeCollectionDisplayType,
    renderMarkdown,
    resolveIndexStoredPathForView,
    resolveRootImageUrlByPreference,
    resolveCollectionImageUrlByPreference,
    mapMediaForCollection,
    toPublicCollection,
    isCollectionAccessBlocked,
    getRootMediaUrl,
    getCollectionMediaUrl,
    isVideoFile
} = {}) => {
    const selectPublishedMediaByCollection = db.prepare(`
        SELECT
            id,
            collection_id,
            published_filename AS filename,
            COALESCE(NULLIF(published_original_name, ''), original_name) AS original_name,
            published_report_markdown AS report_markdown,
            published_order_index AS order_index
        FROM media
        WHERE collection_id = ?
          AND is_published = 1
          AND published_filename IS NOT NULL
          AND published_filename != ''
        ORDER BY published_order_index ASC, id ASC
    `);
    const selectNavCollectionsPublic = db.prepare(`
        SELECT
            id,
            name,
            slug,
            display_type,
            published_report_markdown AS report_markdown,
            order_index,
            is_hidden,
            hide_info,
            show_credit,
            access_blocked
        FROM collections
        WHERE is_hidden = 0
        ORDER BY order_index ASC
    `);

    const getPublicCollectionBySlug = (slug) => {
        const cacheKey = `collection:slug:${slug}`;
        const cached = dataCache.getEntry(cacheKey);
        if (cached) return cached.value;
        const value = db.prepare('SELECT * FROM collections WHERE slug = ?').get(slug) || null;
        dataCache.set(cacheKey, value, 10_000);
        return value;
    };

    const getPublishedMediaByCollectionId = (collectionId) => {
        const cacheKey = `media:published:collectionId:${collectionId}`;
        const cached = dataCache.getEntry(cacheKey);
        if (cached) return cached.value;
        const value = selectPublishedMediaByCollection.all(collectionId);
        dataCache.set(cacheKey, value, 10_000);
        return value;
    };

    const getIndexSettings = () => {
        const cacheKey = 'settings:index';
        const cached = dataCache.getEntry(cacheKey);
        if (cached) return cached.value;

        const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)').all(
            'index_image',
            'index_display_type',
            'index_image_left',
            'index_image_right'
        );
        const map = new Map(rows.map((row) => [row.key, row.value]));
        const indexImageStored = map.get('index_image') || '';
        const indexImageLeftStored = map.get('index_image_left') || '';
        const value = {
            indexImage: resolveIndexStoredPathForView(indexImageStored, 'large'),
            indexDisplayTypeRaw: map.get('index_display_type') || 'single',
            indexImageLeft: resolveIndexStoredPathForView(indexImageLeftStored || indexImageStored, 'large'),
            indexImageRight: resolveIndexStoredPathForView(map.get('index_image_right') || '', 'large')
        };
        dataCache.set(cacheKey, value, 5_000);
        return value;
    };

    const isReservedSlug = (slug) => {
        return slug === 'admin'
            || slug === 'resources'
            || slug === 'content'
            || slug === 'passwd'
            || slug === 'favicon.ico'
            || slug === 'api'
            || slug === '@vite';
    };

    const renderNotFound = (req, res) => {
        res.status(404);
        if (wantsJson(req)) {
            return res.json({ error: 'Not found' });
        }
        return res.render('public/not-found', { collections: res.locals.collections || [] });
    };

    _dataCacheForCache = dataCache;

    app.use((req, res, next) => {
        if (req.path && req.path.startsWith('/admin')) return next();
        const cacheKey = 'nav:public';
        const cached = dataCache.getEntry(cacheKey);
        if (cached) {
            res.locals.collections = cached.value;
            return next();
        }

        const collections = selectNavCollectionsPublic.all();
        dataCache.set(cacheKey, collections, 10_000);
        res.locals.collections = collections;
        return next();
    });

    app.get('/health', (req, res) => {
        return res.json({
            status: 'ok',
            version: appVersion,
            uptimeSeconds: Math.floor((Date.now() - appStartTime) / 1000),
            now: new Date().toISOString()
        });
    });

    app.get('/ready', (req, res) => {
        const checks = {
            database: false,
            contentRoot: false
        };

        try {
            db.prepare('SELECT 1').get();
            checks.database = true;
        } catch (_) {}

        try {
            checks.contentRoot = fs.existsSync(contentRoot);
        } catch (_) {}

        const ready = checks.database && checks.contentRoot;
        return res.status(ready ? 200 : 503).json({
            status: ready ? 'ready' : 'not_ready',
            version: appVersion,
            checks,
            now: new Date().toISOString()
        });
    });

    app.get('/', async (req, res, next) => {
        const settings = getIndexSettings();
        const indexImage = settings.indexImage;
        const indexDisplayTypeRaw = settings.indexDisplayTypeRaw;
        const indexDisplayType = indexDisplayTypeRaw === 'diptych'
            ? 'diptych'
            : (indexDisplayTypeRaw === 'video' ? 'video' : 'single');
        const indexImageLeft = settings.indexImageLeft || indexImage;
        const indexImageRight = settings.indexImageRight || '';
        try {
            return await sendHtmlWithCache(req, res, {
                cacheKey: `page:${res.locals.locale}:${req.originalUrl}`,
                ttlSeconds: 10,
                renderHtml: () => new Promise((resolve, reject) => {
                    res.render('public/index', {
                        indexImage,
                        indexDisplayType,
                        indexImageLeft,
                        indexImageRight
                    }, (err, html) => {
                        if (err) return reject(err);
                        return resolve(html);
                    });
                })
            });
        } catch (err) {
            return next(err);
        }
    });

    app.get('/content/:slug/index.html', (req, res) => {
        const collection = db.prepare('SELECT access_blocked FROM collections WHERE slug = ?').get(req.params.slug);
        if (collection && isCollectionAccessBlocked(collection)) {
            return renderNotFound(req, res);
        }
        const query = new URLSearchParams(req.query).toString();
        return res.redirect(301, `/${req.params.slug}${query ? `?${query}` : ''}`);
    });

    app.get('/content/:slug/content/:photoHtml', (req, res) => {
        const { slug, photoHtml } = req.params;
        const collection = db.prepare('SELECT access_blocked FROM collections WHERE slug = ?').get(slug);
        if (collection && isCollectionAccessBlocked(collection)) {
            return renderNotFound(req, res);
        }
        const nextPath = photoHtml.endsWith('.html') ? photoHtml.slice(0, -5) : photoHtml;
        return res.redirect(301, `/${slug}/${nextPath}`);
    });

    app.get('/api/collections', (req, res) => {
        const cacheKey = 'api:data:collections';
        const cached = dataCache.getEntry(cacheKey);
        const collections = cached ? cached.value : selectNavCollectionsPublic.all();
        if (!cached) dataCache.set(cacheKey, collections, 10_000);
        return sendJsonWithCache(req, res, {
            cacheKey: `api:collections:${req.originalUrl}`,
            ttlSeconds: 10,
            data: { collections }
        });
    });

    app.get('/api/collections/:slug', (req, res) => {
        const { slug } = req.params;
        if (isReservedSlug(slug)) return res.status(404).json({ error: 'Not found' });

        const collection = getPublicCollectionBySlug(slug);
        if (!collection) return res.status(404).json({ error: 'Not found' });
        if (isCollectionAccessBlocked(collection)) return res.status(404).json({ error: 'Not found' });

        const mediaList = getPublishedMediaByCollectionId(collection.id);
        const publicCollection = toPublicCollection(collection);
        const mediaItems = mediaList.map((mediaItem) => mapMediaForCollection(publicCollection, mediaItem));
        return sendJsonWithCache(req, res, {
            cacheKey: `api:collection:${slug}:${req.originalUrl}`,
            ttlSeconds: 10,
            data: { collection: publicCollection, mediaItems }
        });
    });

    app.get('/:slug', async (req, res, next) => {
        const { slug } = req.params;
        if (isReservedSlug(slug)) return next();

        const collection = getPublicCollectionBySlug(slug);
        if (!collection) return renderNotFound(req, res);
        if (isCollectionAccessBlocked(collection)) return renderNotFound(req, res);

        const publicCollection = toPublicCollection(collection);
        const displayType = normalizeCollectionDisplayType(publicCollection.display_type);
        const reportHtml = renderMarkdown(publicCollection.report_markdown || '');
        const rawMedia = getPublishedMediaByCollectionId(collection.id);
        const totalMediaCount = rawMedia.length;
        const preferredSize = 'thumb';
        const processedMedia = rawMedia.map((mediaItem) => {
            const mapped = mapMediaForCollection(publicCollection, mediaItem);
            if (mapped.isImage) {
                mapped.mediaUrl = resolveCollectionImageUrlByPreference(publicCollection.slug, mapped.filename, preferredSize);
            }
            return mapped;
        });

        try {
            return await sendHtmlWithCache(req, res, {
                cacheKey: `page:${res.locals.locale}:${req.originalUrl}`,
                ttlSeconds: 10,
                renderHtml: () => new Promise((resolve, reject) => {
                    res.render('public/collection', {
                        collection: publicCollection,
                        displayType,
                        reportHtml,
                        media: processedMedia,
                        totalMediaCount: totalMediaCount,
                        currentPage: 1,
                        totalPages: 1,
                        offset: 0,
                        wallBatchSize: 20
                    }, (err, html) => {
                        if (err) return reject(err);
                        return resolve(html);
                    });
                })
            });
        } catch (err) {
            return next(err);
        }
    });

    app.get('/:slug/:mediaLarge', async (req, res, next) => {
        const { slug, mediaLarge } = req.params;
        if (isReservedSlug(slug)) return next();

        const normalized = mediaLarge.endsWith('.html') ? mediaLarge.slice(0, -5) : mediaLarge;
        if (!normalized.endsWith('_large')) return renderNotFound(req, res);

        const requestedFilename = normalized.slice(0, -'_large'.length);
        const collection = getPublicCollectionBySlug(slug);
        if (!collection) return renderNotFound(req, res);
        if (isCollectionAccessBlocked(collection)) return renderNotFound(req, res);

        const publicCollection = toPublicCollection(collection);
        const displayType = normalizeCollectionDisplayType(publicCollection.display_type);
        const mediaList = getPublishedMediaByCollectionId(collection.id);

        let currentIndex = mediaList.findIndex((mediaItem) => mediaItem.filename === requestedFilename);
        if (currentIndex === -1) {
            currentIndex = mediaList.findIndex((mediaItem) => mediaItem.filename.replace(/\.[^/.]+$/, '') === requestedFilename);
        }
        if (currentIndex === -1) return renderNotFound(req, res);

        const buildLargePageUrl = (mediaItem) => {
            const base = mediaItem.filename.replace(/\.[^/.]+$/, '');
            return `/${publicCollection.slug}/${base}_large`;
        };

        let reportHtml = '';
        let mediaItems = [];
        let prevUrl = null;
        let nextUrl = null;
        let currentPage = 1;
        let totalPages = 1;

        if (displayType === 'diptych') {
            const pageIndex = Math.floor(currentIndex / 2);
            const leftIndex = pageIndex * 2;
            const rightIndex = leftIndex + 1;
            const left = mediaList[leftIndex] || null;
            const right = mediaList[rightIndex] || null;

            mediaItems = [left, right].filter(Boolean).map((mediaItem) => {
                const mapped = mapMediaForCollection(publicCollection, mediaItem);
                if (mapped.isImage) mapped.mediaUrl = mapped.largeUrl;
                return mapped;
            });
            prevUrl = pageIndex > 0 ? buildLargePageUrl(mediaList[(pageIndex - 1) * 2]) : null;
            nextUrl = (pageIndex + 1) * 2 < mediaList.length ? buildLargePageUrl(mediaList[(pageIndex + 1) * 2]) : null;
            currentPage = pageIndex + 1;
            totalPages = Math.max(1, Math.ceil(mediaList.length / 2));
            reportHtml = renderMarkdown((mediaList[currentIndex] && mediaList[currentIndex].report_markdown) || '');
        } else {
            const mediaItem = mediaList[currentIndex];
            mediaItems = [(() => {
                const mapped = mapMediaForCollection(publicCollection, mediaItem);
                if (mapped.isImage) mapped.mediaUrl = mapped.largeUrl;
                return mapped;
            })()];
            reportHtml = renderMarkdown(mediaItem.report_markdown || '');

            const prevMedia = currentIndex > 0 ? mediaList[currentIndex - 1] : null;
            const nextMedia = currentIndex < mediaList.length - 1 ? mediaList[currentIndex + 1] : null;
            prevUrl = prevMedia ? buildLargePageUrl(prevMedia) : null;
            nextUrl = nextMedia ? buildLargePageUrl(nextMedia) : null;
            currentPage = currentIndex + 1;
            totalPages = Math.max(1, mediaList.length);
        }

        try {
            return await sendHtmlWithCache(req, res, {
                cacheKey: `page:${res.locals.locale}:${req.originalUrl}`,
                ttlSeconds: 10,
                renderHtml: () => new Promise((resolve, reject) => {
                    res.render('public/work_large', {
                        collection: publicCollection,
                        displayType,
                        reportHtml,
                        mediaItems,
                        prevUrl,
                        nextUrl,
                        currentPage,
                        totalPages
                    }, (err, html) => {
                        if (err) return reject(err);
                        return resolve(html);
                    });
                })
            });
        } catch (err) {
            return next(err);
        }
    });

    return {
        clearIndexSettingsCache
    };
};

const clearIndexSettingsCache = () => {
    if (_dataCacheForCache) {
        _dataCacheForCache.delete('settings:index');
    }
};

module.exports = {
    registerPublicRoutes
};

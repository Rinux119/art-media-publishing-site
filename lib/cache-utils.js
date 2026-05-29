const crypto = require('crypto');

const CACHE_SECONDS = {
    oneHour: 60 * 60,
    oneDay: 60 * 60 * 24,
    thirtyDays: 60 * 60 * 24 * 30,
    oneYear: 60 * 60 * 24 * 365
};

const MEDIA_CACHE_POLICY = {
    maxAgeSeconds: CACHE_SECONDS.oneYear,
    immutable: true,
    staleWhileRevalidateSeconds: CACHE_SECONDS.oneDay,
    staleIfErrorSeconds: CACHE_SECONDS.thirtyDays
};

class TtlLruCache {
    constructor({ maxEntries = 2000 } = {}) {
        this.maxEntries = Math.max(1, Number(maxEntries) || 2000);
        this.map = new Map();
    }

    getEntry(key) {
        const entry = this.map.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
            this.map.delete(key);
            return null;
        }
        this.map.delete(key);
        this.map.set(key, entry);
        return entry;
    }

    get(key) {
        const entry = this.getEntry(key);
        return entry ? entry.value : undefined;
    }

    set(key, value, ttlMs) {
        const expiresAt = typeof ttlMs === 'number' && ttlMs > 0 ? Date.now() + Math.floor(ttlMs) : null;
        this.map.set(key, { value, expiresAt });
        while (this.map.size > this.maxEntries) {
            const firstKey = this.map.keys().next().value;
            if (typeof firstKey === 'undefined') break;
            this.map.delete(firstKey);
        }
    }

    delete(key) {
        this.map.delete(key);
    }

    deleteByPrefix(prefix) {
        if (!prefix) return;
        for (const key of this.map.keys()) {
            if (String(key).startsWith(prefix)) this.map.delete(key);
        }
    }
}

const setCacheControl = (res, {
    maxAgeSeconds,
    immutable = false,
    staleWhileRevalidateSeconds = 0,
    staleIfErrorSeconds = 0
}) => {
    if (!res || typeof maxAgeSeconds !== 'number') return;
    const directives = ['public', `max-age=${Math.max(0, Math.floor(maxAgeSeconds))}`];
    if (immutable) directives.push('immutable');
    if (staleWhileRevalidateSeconds > 0) directives.push(`stale-while-revalidate=${Math.floor(staleWhileRevalidateSeconds)}`);
    if (staleIfErrorSeconds > 0) directives.push(`stale-if-error=${Math.floor(staleIfErrorSeconds)}`);
    res.setHeader('Cache-Control', directives.join(', '));
};

const computeStrongEtag = (payload) => {
    const sha1 = crypto.createHash('sha1').update(String(payload)).digest('hex');
    return `W/"${sha1}"`;
};

const createCacheUtilities = () => {
    const dataCache = new TtlLruCache({ maxEntries: 1000 });
    const responseCache = new TtlLruCache({ maxEntries: 200 });
    const assetVersionCache = new TtlLruCache({ maxEntries: 500 });

    const invalidateCachedData = ({ collectionId = null, collectionSlug = null, settings = false } = {}) => {
        const normalizedCollectionId = collectionId === null || typeof collectionId === 'undefined'
            ? null
            : Number(collectionId);

        dataCache.delete('nav:public');
        dataCache.delete('nav:admin');
        if (settings) dataCache.delete('settings:index');
        dataCache.deleteByPrefix('api:data:');
        if (collectionSlug) dataCache.delete(`collection:slug:${collectionSlug}`);
        if (normalizedCollectionId !== null && !Number.isNaN(normalizedCollectionId)) {
            dataCache.delete(`media:collectionId:${normalizedCollectionId}`);
            dataCache.delete(`media:published:collectionId:${normalizedCollectionId}`);
        }
        if (!collectionSlug && (normalizedCollectionId === null || Number.isNaN(normalizedCollectionId)) && !settings) {
            dataCache.deleteByPrefix('collection:slug:');
            dataCache.deleteByPrefix('media:collectionId:');
            dataCache.deleteByPrefix('media:published:collectionId:');
        }

        responseCache.deleteByPrefix('api:');
        responseCache.deleteByPrefix('page:');
    };

    const sendJsonWithCache = (req, res, { cacheKey, ttlSeconds, data }) => {
        const cached = responseCache.getEntry(cacheKey);
        if (cached) {
            const { body, etag } = cached.value || {};
            if (etag) res.setHeader('ETag', etag);
            setCacheControl(res, {
                maxAgeSeconds: ttlSeconds,
                immutable: false,
                staleWhileRevalidateSeconds: Math.max(1, Math.floor(ttlSeconds * 3)),
                staleIfErrorSeconds: CACHE_SECONDS.oneDay
            });
            const inm = req.headers['if-none-match'];
            if (etag && typeof inm === 'string' && inm === etag) return res.status(304).end();
            if (typeof body === 'string') return res.type('application/json; charset=utf-8').send(body);
        }

        const json = JSON.stringify(data);
        const etag = computeStrongEtag(json);
        responseCache.set(cacheKey, { body: json, etag }, ttlSeconds * 1000);
        res.setHeader('ETag', etag);
        setCacheControl(res, {
            maxAgeSeconds: ttlSeconds,
            immutable: false,
            staleWhileRevalidateSeconds: Math.max(1, Math.floor(ttlSeconds * 3)),
            staleIfErrorSeconds: CACHE_SECONDS.oneDay
        });
        const inm = req.headers['if-none-match'];
        if (typeof inm === 'string' && inm === etag) return res.status(304).end();
        return res.type('application/json; charset=utf-8').send(json);
    };

    const sendHtmlWithCache = async (req, res, { cacheKey, ttlSeconds, renderHtml }) => {
        const cached = responseCache.getEntry(cacheKey);
        if (cached) {
            const { body, etag } = cached.value || {};
            if (etag) res.setHeader('ETag', etag);
            setCacheControl(res, {
                maxAgeSeconds: ttlSeconds,
                immutable: false,
                staleWhileRevalidateSeconds: Math.max(1, Math.floor(ttlSeconds * 3)),
                staleIfErrorSeconds: CACHE_SECONDS.oneDay
            });
            const inm = req.headers['if-none-match'];
            if (etag && typeof inm === 'string' && inm === etag) return res.status(304).end();
            if (req.method === 'HEAD') return res.status(200).end();
            if (typeof body === 'string') return res.type('text/html; charset=utf-8').send(body);
        }

        const html = await renderHtml();
        const etag = computeStrongEtag(html);
        responseCache.set(cacheKey, { body: html, etag }, ttlSeconds * 1000);
        res.setHeader('ETag', etag);
        setCacheControl(res, {
            maxAgeSeconds: ttlSeconds,
            immutable: false,
            staleWhileRevalidateSeconds: Math.max(1, Math.floor(ttlSeconds * 3)),
            staleIfErrorSeconds: CACHE_SECONDS.oneDay
        });
        const inm = req.headers['if-none-match'];
        if (typeof inm === 'string' && inm === etag) return res.status(304).end();
        if (req.method === 'HEAD') return res.status(200).end();
        return res.type('text/html; charset=utf-8').send(html);
    };

    return {
        dataCache,
        responseCache,
        assetVersionCache,
        invalidateCachedData,
        sendJsonWithCache,
        sendHtmlWithCache
    };
};

module.exports = {
    CACHE_SECONDS,
    MEDIA_CACHE_POLICY,
    TtlLruCache,
    setCacheControl,
    createCacheUtilities
};

const COLLECTION_DISPLAY_TYPES = new Set(['single', 'diptych', 'wall', 'report']);

let _marked = null;
const _markedReady = import('marked').then(mod => {
    _marked = mod.marked;
    _marked.setOptions({ gfm: true, breaks: true });
});

const createPublicSiteHelpers = ({
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
} = {}) => {
    const normalizeCollectionDisplayType = (value) => {
        const type = (typeof value === 'string' ? value : '').toLowerCase();
        return COLLECTION_DISPLAY_TYPES.has(type) ? type : 'single';
    };

    const renderMarkdown = (value) => {
        const source = typeof value === 'string' ? value : '';
        if (!source.trim()) return '';
        if (!_marked) return source;
        return _marked.parse(source);
    };

    const resolveCollectionImageUrlByPreference = (collectionSlug, filename, preferredSize = 'large') => {
        if (!collectionSlug || !filename) return null;
        if (isVideoFile(filename)) {
            const url = getCollectionMediaUrl(collectionSlug, 'video', filename);
            return cdnUrl ? `${cdnUrl}${url}` : url;
        }
        if (!isSupportedImageVariantSize(preferredSize)) preferredSize = 'large';

        const preferredPath = path.join(getCollectionMediaDir(collectionSlug, preferredSize), filename);
        if (fs.existsSync(preferredPath)) {
            const url = getCollectionMediaUrl(collectionSlug, preferredSize, filename);
            return cdnUrl ? `${cdnUrl}${url}` : url;
        }

        if (preferredSize !== 'original') {
            const originalPath = path.join(getCollectionMediaDir(collectionSlug, 'original'), filename);
            const largePath = path.join(getCollectionMediaDir(collectionSlug, 'large'), filename);
            if (fs.existsSync(originalPath) || fs.existsSync(largePath)) {
                const url = getCollectionMediaUrl(collectionSlug, preferredSize, filename);
                return cdnUrl ? `${cdnUrl}${url}` : url;
            }
        }

        const fallbackSizes = ['large', 'medium', 'thumb'].filter((size, index, list) => list.indexOf(size) === index);
        for (const size of fallbackSizes) {
            const filePath = path.join(getCollectionMediaDir(collectionSlug, size), filename);
            if (fs.existsSync(filePath)) {
                const url = getCollectionMediaUrl(collectionSlug, size, filename);
                return cdnUrl ? `${cdnUrl}${url}` : url;
            }
        }

        const url = getCollectionMediaUrl(collectionSlug, preferredSize, filename);
        return cdnUrl ? `${cdnUrl}${url}` : url;
    };

    const resolveRootImageUrlByPreference = (filename, preferredSize = 'large') => {
        if (!filename) return null;
        if (isVideoFile(filename)) {
            const url = getRootMediaUrl('video', filename);
            return cdnUrl ? `${cdnUrl}${url}` : url;
        }
        if (!isSupportedImageVariantSize(preferredSize)) preferredSize = 'large';

        const preferredPath = path.join(getRootImagesDir(preferredSize), filename);
        if (fs.existsSync(preferredPath)) {
            const url = getRootMediaUrl(preferredSize, filename);
            return cdnUrl ? `${cdnUrl}${url}` : url;
        }

        if (preferredSize !== 'original') {
            const originalPath = path.join(getRootImagesDir('original'), filename);
            const legacyPath = path.join(getRootImagesDir(null), filename);
            const largePath = path.join(getRootImagesDir('large'), filename);
            if (fs.existsSync(originalPath) || fs.existsSync(legacyPath) || fs.existsSync(largePath)) {
                const url = getRootMediaUrl(preferredSize, filename);
                return cdnUrl ? `${cdnUrl}${url}` : url;
            }
        }

        const fallbackSizes = ['large', 'medium', 'thumb', null];
        for (const size of fallbackSizes) {
            const filePath = size
                ? path.join(getRootImagesDir(size), filename)
                : path.join(getRootImagesDir(null), filename);
            if (fs.existsSync(filePath)) {
                const url = getRootMediaUrl(size, filename);
                return cdnUrl ? `${cdnUrl}${url}` : url;
            }
        }

        const url = getRootMediaUrl(preferredSize, filename);
        return cdnUrl ? `${cdnUrl}${url}` : url;
    };

    const parseIndexStoredPathToFilename = (storedPath) => {
        if (!storedPath || typeof storedPath !== 'string') return null;
        const filename = path.basename(storedPath);
        if (!filename) return null;
        if (filename !== path.basename(filename) || filename.includes('/') || filename.includes('\\')) return null;
        return filename;
    };

    const resolveIndexStoredPathForView = (storedPath, preferredSize = 'large') => {
        const filename = parseIndexStoredPathToFilename(storedPath);
        if (!filename) return storedPath;
        if (isVideoFile(filename)) {
            const videoPath = path.join(getRootImagesDir(), 'video', filename);
            if (fs.existsSync(videoPath)) {
                const url = getRootMediaUrl('video', filename);
                return cdnUrl ? `${cdnUrl}${url}` : `..${url}`;
            }
            const legacyPath = path.join(getRootImagesDir(null), filename);
            if (fs.existsSync(legacyPath)) {
                const url = getRootMediaUrl(null, filename);
                return cdnUrl ? `${cdnUrl}${url}` : `..${url}`;
            }
            const url = getRootMediaUrl('video', filename);
            return cdnUrl ? `${cdnUrl}${url}` : `..${url}`;
        }

        const url = resolveRootImageUrlByPreference(filename, preferredSize);
        if (!url) return storedPath;
        return cdnUrl ? url : `..${url}`;
    };

    const toPublicCollection = (collection) => {
        if (!collection) return null;
        const next = { ...collection, report_markdown: collection.published_report_markdown || '' };
        delete next.published_report_markdown;
        return next;
    };

    const isCollectionAccessBlocked = (collection) => !!(collection && collection.access_blocked);

    const mapMediaForCollection = (collection, media) => {
        const mediaUrl = resolveCollectionImageUrlByPreference(collection.slug, media.filename, 'large');
        return {
            ...media,
            slug: media.filename.replace(/\.[^/.]+$/, ''),
            isVideo: isVideoFile(media.filename),
            isImage: isImageFile(media.filename),
            mediaUrl,
            thumbUrl: resolveCollectionImageUrlByPreference(collection.slug, media.filename, 'thumb'),
            mediumUrl: resolveCollectionImageUrlByPreference(collection.slug, media.filename, 'medium'),
            largeUrl: resolveCollectionImageUrlByPreference(collection.slug, media.filename, 'large')
        };
    };

    return {
        normalizeCollectionDisplayType,
        renderMarkdown,
        resolveCollectionImageUrlByPreference,
        resolveRootImageUrlByPreference,
        parseIndexStoredPathToFilename,
        resolveIndexStoredPathForView,
        toPublicCollection,
        isCollectionAccessBlocked,
        mapMediaForCollection
    };
};

module.exports = {
    createPublicSiteHelpers,
    markedReady: _markedReady
};

const createMediaPathHelpers = ({ contentRoot, fs, path, cdnUrl, logger = console } = {}) => {
    const isSafePathSegment = (value) => {
        if (!value || typeof value !== 'string') return false;
        return value === path.basename(value) && !value.includes('/') && !value.includes('\\');
    };

    const getCollectionImagesRootDir = (collectionSlug) => path.join(contentRoot, collectionSlug, 'content', 'images');
    const getCollectionMediaDir = (collectionSlug, size = 'large') => path.join(getCollectionImagesRootDir(collectionSlug), size);
    const getRootImagesDir = (size = null) => size ? path.join(contentRoot, 'images', size) : path.join(contentRoot, 'images');
    const getCollectionMediaUrl = (collectionSlug, size, filename) => `/content/${collectionSlug}/content/images/${size}/${filename}`;
    const getRootMediaUrl = (size, filename) => size ? `/content/images/${size}/${filename}` : `/content/images/${filename}`;

    const removeCollectionMediaAssets = (collectionSlug, filename) => {
        if (!collectionSlug || !filename || !isSafePathSegment(collectionSlug) || !isSafePathSegment(filename)) return;
        const candidates = [
            path.join(getCollectionMediaDir(collectionSlug, 'large'), filename),
            path.join(getCollectionMediaDir(collectionSlug, 'original'), filename),
            path.join(getCollectionMediaDir(collectionSlug, 'medium'), filename),
            path.join(getCollectionMediaDir(collectionSlug, 'thumb'), filename),
            path.join(getCollectionImagesRootDir(collectionSlug), 'video', filename)
        ];

        candidates.forEach((filePath) => {
            if (!fs.existsSync(filePath)) return;
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                logger.error(`Failed to delete file: ${filePath}`, err);
            }
        });

        const cleanupIfEmpty = (dirPath) => {
            if (!fs.existsSync(dirPath)) return;
            try {
                const entries = fs.readdirSync(dirPath);
                if (entries.length === 0) fs.rmdirSync(dirPath);
            } catch (_) {}
        };

        cleanupIfEmpty(getCollectionMediaDir(collectionSlug, 'large'));
        cleanupIfEmpty(getCollectionMediaDir(collectionSlug, 'original'));
        cleanupIfEmpty(getCollectionMediaDir(collectionSlug, 'medium'));
        cleanupIfEmpty(getCollectionMediaDir(collectionSlug, 'thumb'));
        cleanupIfEmpty(path.join(getCollectionImagesRootDir(collectionSlug), 'video'));
        cleanupIfEmpty(path.join(getCollectionImagesRootDir(collectionSlug)));
        cleanupIfEmpty(path.join(contentRoot, collectionSlug, 'content'));
        cleanupIfEmpty(path.join(contentRoot, collectionSlug));
    };

    const removeRootMediaAssets = (filename) => {
        if (!filename || !isSafePathSegment(filename)) return;
        const candidates = [
            path.join(getRootImagesDir(null), filename),
            path.join(getRootImagesDir('original'), filename),
            path.join(getRootImagesDir('large'), filename),
            path.join(getRootImagesDir('medium'), filename),
            path.join(getRootImagesDir('thumb'), filename),
            path.join(getRootImagesDir('video'), filename)
        ];

        candidates.forEach((filePath) => {
            if (!fs.existsSync(filePath)) return;
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                logger.error(`Failed to delete root media file: ${filePath}`, err);
            }
        });
    };

    return {
        isSafePathSegment,
        getCollectionImagesRootDir,
        getCollectionMediaDir,
        getRootImagesDir,
        getCollectionMediaUrl,
        getRootMediaUrl,
        removeCollectionMediaAssets,
        removeRootMediaAssets
    };
};

module.exports = {
    createMediaPathHelpers
};

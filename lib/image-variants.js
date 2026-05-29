const crypto = require('crypto');

const createImageVariantService = ({
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
    sharpInputOptions
}) => {
    const getImageVariantOutputOptions = (ext) => {
        const mediaConfig = getMediaConfig();
        const quality = mediaConfig.imageVariantQuality || 82;
        if (ext === '.jpg' || ext === '.jpeg') return { format: 'jpeg', options: { quality, mozjpeg: true } };
        if (ext === '.png') return { format: 'png', options: { compressionLevel: 9 } };
        return { format: null, options: null };
    };

    const getOriginalImageOutputOptions = (ext) => {
        const mediaConfig = getMediaConfig();
        const quality = mediaConfig.imageOriginalQuality || 90;
        if (ext === '.jpg' || ext === '.jpeg') {
            return { format: 'jpeg', options: { quality, mozjpeg: true } };
        }
        if (ext === '.png') {
            return { format: 'png', options: { compressionLevel: 9, effort: 10 } };
        }
        return { format: null, options: null };
    };

    const compressOriginalImageInPlace = async (filePath, { priority = 'low' } = {}) => {
        if (!filePath || !fs.existsSync(filePath)) return false;

        const ext = getFileExt(filePath);
        if (ext === '.gif') return false;

        const { format, options } = getOriginalImageOutputOptions(ext);
        if (!format || !options) return false;

        const originalStat = await fs.stat(filePath);
        if (!originalStat || !originalStat.size) return false;

        const tmpPath = `${filePath}.tmp-${crypto.randomBytes(8).toString('hex')}`;
        return withImageProcessing(priority, async () => {
            try {
                const pipeline = sharp(filePath, sharpInputOptions).rotate();
                if (format === 'jpeg') pipeline.jpeg(options);
                else if (format === 'png') pipeline.png(options);

                await pipeline.toFile(tmpPath);

                const tmpStat = await fs.stat(tmpPath);
                if (tmpStat && tmpStat.size > 0 && tmpStat.size < originalStat.size) {
                    await fs.move(tmpPath, filePath, { overwrite: true });
                    return true;
                }

                await fs.remove(tmpPath);
                return false;
            } catch (_) {
                try { if (fs.existsSync(tmpPath)) await fs.remove(tmpPath); } catch (_) {}
                return false;
            }
        });
    };

    const inFlightVariantGenerations = new Map();
    const withGenerationLock = async (key, fn) => {
        const existing = inFlightVariantGenerations.get(key);
        if (existing) return existing;
        const promise = (async () => {
            try {
                return await fn();
            } finally {
                inFlightVariantGenerations.delete(key);
            }
        })();
        inFlightVariantGenerations.set(key, promise);
        return promise;
    };

    const generateImageVariant = async ({ sourcePath, targetPath, size, priority = 'high' }) => {
        if (!sourcePath || !targetPath) return false;
        const mediaConfig = getMediaConfig();
        const maxWidthMap = mediaConfig.imageVariantMaxWidth || {};
        if (!size || !maxWidthMap[size]) return false;
        if (!fs.existsSync(sourcePath)) return false;
        return withImageProcessing(priority, async () => {
            if (fs.existsSync(targetPath)) {
                try {
                    const meta = await sharp(targetPath, sharpInputOptions).metadata();
                    const maxSide = Math.max(meta.width || 0, meta.height || 0);
                    if (maxSide > 0 && maxSide <= maxWidthMap[size]) return true;
                } catch (_) {}
            }

            await fs.ensureDir(path.dirname(targetPath));
            const ext = getFileExt(targetPath);
            if (ext === '.gif') {
                await fs.copy(sourcePath, targetPath, { overwrite: false, errorOnExist: false });
                return fs.existsSync(targetPath);
            }

            const { format, options } = getImageVariantOutputOptions(ext);
            if (!format || !options) return false;

            const tmpPath = `${targetPath}.tmp-${crypto.randomBytes(8).toString('hex')}`;
            try {
                const transformer = sharp(sharpInputOptions)
                    .rotate()
                    .resize({
                        width: maxWidthMap[size],
                        height: maxWidthMap[size],
                        fit: 'inside',
                        withoutEnlargement: true
                    });

                if (format === 'jpeg') transformer.jpeg(options);
                else if (format === 'png') transformer.png(options);

                await pipelineAsync(
                    fs.createReadStream(sourcePath),
                    transformer,
                    fs.createWriteStream(tmpPath)
                );

                await fs.move(tmpPath, targetPath, { overwrite: true });
                return fs.existsSync(targetPath);
            } catch (_) {
                try { if (fs.existsSync(tmpPath)) await fs.remove(tmpPath); } catch (_) {}
                return false;
            }
        });
    };

    const ensureCollectionImageVariants = async (collectionSlug, filename, { priority = 'low', onStep = null } = {}) => {
        if (!collectionSlug || !filename || !isImageFile(filename)) return;

        const originalPath = path.join(getCollectionMediaDir(collectionSlug, 'original'), filename);
        const legacyLargePath = path.join(getCollectionMediaDir(collectionSlug, 'large'), filename);
        const sourcePath = fs.existsSync(originalPath) ? originalPath : (fs.existsSync(legacyLargePath) ? legacyLargePath : null);
        if (!sourcePath) return;

        const generate = async (size) => {
            const targetPath = path.join(getCollectionMediaDir(collectionSlug, size), filename);
            const lockKey = `${collectionSlug}::${size}::${filename}`;
            const ok = await withGenerationLock(lockKey, async () => generateImageVariant({ sourcePath, targetPath, size, priority }));
            if (typeof onStep === 'function') {
                try { onStep({ kind: 'variant', size, ok }); } catch (_) {}
            }
            return ok;
        };

        for (const size of ['thumb', 'large', 'medium']) {
            await generate(size);
        }
    };

    const ensureRootImageVariants = async (filename, { priority = 'low', onStep = null } = {}) => {
        if (!filename || !isImageFile(filename)) return;

        const originalPath = path.join(getRootImagesDir('original'), filename);
        const legacyPath = path.join(getRootImagesDir(null), filename);
        const legacyLargePath = path.join(getRootImagesDir('large'), filename);
        const sourcePath = fs.existsSync(originalPath) ? originalPath : (fs.existsSync(legacyPath) ? legacyPath : (fs.existsSync(legacyLargePath) ? legacyLargePath : null));
        if (!sourcePath) return;

        const generate = async (size) => {
            const targetPath = path.join(getRootImagesDir(size), filename);
            const lockKey = `root::${size}::${filename}`;
            const ok = await withGenerationLock(lockKey, async () => generateImageVariant({ sourcePath, targetPath, size, priority }));
            if (typeof onStep === 'function') {
                try { onStep({ kind: 'variant', size, ok }); } catch (_) {}
            }
            return ok;
        };

        for (const size of ['thumb', 'large', 'medium']) {
            await generate(size);
        }
    };

    return {
        compressOriginalImageInPlace,
        withGenerationLock,
        generateImageVariant,
        ensureCollectionImageVariants,
        ensureRootImageVariants
    };
};

module.exports = {
    createImageVariantService
};

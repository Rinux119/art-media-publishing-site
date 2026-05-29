const createMediaRequestHandler = ({
    isSafePathSegment,
    isVideoFile,
    isImageFile,
    isSupportedImageVariantSize,
    getFileExt,
    getMediaConfig,
    withImageProcessing,
    sharp,
    sharpInputOptions,
    withGenerationLock,
    generateImageVariant,
    applyMediaCache,
    getParams,
    getExistingVideoPath,
    getExistingVariantPath,
    buildVariantPath,
    resolveSourcePath,
    getLockKey
} = {}) => {
    return async (req, res, next) => {
        const { scopeKey = null, size, filename } = getParams(req);
        if ((scopeKey !== null && !isSafePathSegment(scopeKey)) || !isSafePathSegment(filename)) {
            return res.status(400).send('Bad request');
        }

        if (size === 'video' || isVideoFile(filename)) {
            const videoPath = getExistingVideoPath({ scopeKey, filename });
            if (videoPath) {
                applyMediaCache(res);
                return res.sendFile(videoPath);
            }
            return res.status(404).send('Video not found');
        }

        if (!isSupportedImageVariantSize(size)) return next();

        const filePath = getExistingVariantPath({ scopeKey, size, filename });
        if (filePath) {
            applyMediaCache(res);
            if (!isImageFile(filename)) return res.sendFile(filePath);
            if (size === 'original') return res.status(404).send('Not found');
            if (getFileExt(filename) === '.gif') return res.sendFile(filePath);

            const maxWidthMap = getMediaConfig().imageVariantMaxWidth;
            const maxWidth = maxWidthMap ? maxWidthMap[size] : undefined;
            if (!maxWidth) return res.sendFile(filePath);
            try {
                const meta = await withImageProcessing('high', async () => sharp(filePath, sharpInputOptions).metadata());
                const maxSide = Math.max(meta.width || 0, meta.height || 0);
                if (maxSide > 0 && maxSide <= maxWidth) return res.sendFile(filePath);
            } catch (_) {
                return res.sendFile(filePath);
            }
        }

        if (!isImageFile(filename)) return res.status(404).send('Not found');
        if (size === 'original') return res.status(404).send('Not found');

        const sourcePath = resolveSourcePath({ scopeKey, filename });
        if (!sourcePath) return res.status(404).send('Not found');

        try {
            const lockKey = getLockKey({ scopeKey, size, filename });
            const targetPath = buildVariantPath({ scopeKey, size, filename });
            await withGenerationLock(lockKey, async () => generateImageVariant({
                sourcePath,
                targetPath,
                size,
                priority: 'high'
            }));
            const generatedPath = getExistingVariantPath({ scopeKey, size, filename });
            if (generatedPath) {
                applyMediaCache(res);
                return res.sendFile(generatedPath);
            }
            return res.status(404).send('Not found');
        } catch (err) {
            return next(err);
        }
    };
};

module.exports = {
    createMediaRequestHandler
};

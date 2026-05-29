const createAssetHelpers = ({
    fs,
    path,
    baseDir,
    contentRoot,
    assetVersionCache,
    getFileExt,
    imageExtensions,
    videoExtensions,
    cacheSeconds
} = {}) => {
    const resolveAssetAbsolutePath = (urlPath) => {
        if (!urlPath || typeof urlPath !== 'string' || !urlPath.startsWith('/')) return null;
        if (urlPath.startsWith('/resources/')) return path.join(baseDir, urlPath.slice(1));
        if (urlPath.startsWith('/content/')) return path.join(contentRoot, urlPath.slice('/content/'.length));
        return null;
    };

    const getAssetVersion = (absolutePath) => {
        if (!absolutePath) return null;
        const cached = assetVersionCache.getEntry(absolutePath);
        if (cached) return cached.value;
        try {
            const stat = fs.statSync(absolutePath);
            const version = `${Math.floor(stat.mtimeMs).toString(36)}-${Number(stat.size || 0).toString(36)}`;
            assetVersionCache.set(absolutePath, version, 5 * 60 * 1000);
            return version;
        } catch (_) {
            return null;
        }
    };

    const assetUrl = (urlPath) => {
        if (!urlPath || typeof urlPath !== 'string') return urlPath;
        if (!urlPath.startsWith('/')) return urlPath;
        if (/[?&]v=/.test(urlPath)) return urlPath;

        const hashIndex = urlPath.indexOf('#');
        const pathWithoutHash = hashIndex === -1 ? urlPath : urlPath.slice(0, hashIndex);
        const hash = hashIndex === -1 ? '' : urlPath.slice(hashIndex);

        const absolutePath = resolveAssetAbsolutePath(pathWithoutHash);
        const version = absolutePath ? getAssetVersion(absolutePath) : null;
        if (!version) return urlPath;

        const joiner = pathWithoutHash.includes('?') ? '&' : '?';
        return `${pathWithoutHash}${joiner}v=${encodeURIComponent(version)}${hash}`;
    };

    const guessStrongCachePolicyForFilePath = (res, filePath) => {
        const originalUrl = res && res.req && typeof res.req.originalUrl === 'string' ? res.req.originalUrl : '';
        const isVersioned = /[?&]v=/.test(originalUrl);
        const ext = getFileExt(filePath);
        const lowerPath = String(filePath || '').toLowerCase();
        const isMedia = imageExtensions.has(ext) || videoExtensions.has(ext);
        const isContentImageOrVideo = lowerPath.includes(`${path.sep}content${path.sep}images${path.sep}`)
            || lowerPath.includes(`${path.sep}images${path.sep}`);

        if (isMedia || isContentImageOrVideo) {
            return {
                maxAgeSeconds: cacheSeconds.oneYear,
                immutable: true,
                staleWhileRevalidateSeconds: cacheSeconds.oneDay,
                staleIfErrorSeconds: cacheSeconds.thirtyDays
            };
        }

        if (ext === '.css' || ext === '.js') {
            return {
                maxAgeSeconds: isVersioned ? cacheSeconds.oneYear : cacheSeconds.oneDay,
                immutable: isVersioned,
                staleWhileRevalidateSeconds: cacheSeconds.oneDay,
                staleIfErrorSeconds: cacheSeconds.thirtyDays
            };
        }

        return {
            maxAgeSeconds: cacheSeconds.oneDay,
            immutable: false,
            staleWhileRevalidateSeconds: cacheSeconds.oneHour,
            staleIfErrorSeconds: cacheSeconds.oneDay
        };
    };

    return {
        resolveAssetAbsolutePath,
        getAssetVersion,
        assetUrl,
        guessStrongCachePolicyForFilePath
    };
};

module.exports = {
    createAssetHelpers
};

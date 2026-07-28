const createMediaLibraryService = ({
    fs,
    path,
    contentRoot,
    db,
    isSafePathSegment,
    logger = console
} = {}) => {
    const LIBRARY_DIR_NAME = 'media_library';

    const getMediaLibraryRootDir = () => path.join(contentRoot, LIBRARY_DIR_NAME);
    const getMediaLibraryDir = (size = 'large') => path.join(getMediaLibraryRootDir(), size);
    const getMediaLibraryVideoDir = () => path.join(getMediaLibraryRootDir(), 'video');
    const getMediaLibraryUrl = (size, filename) => `/content/${LIBRARY_DIR_NAME}/${size}/${filename}`;

    const ensureDirs = () => {
        fs.ensureDirSync(getMediaLibraryDir('original'));
        fs.ensureDirSync(getMediaLibraryDir('large'));
        fs.ensureDirSync(getMediaLibraryDir('medium'));
        fs.ensureDirSync(getMediaLibraryDir('thumb'));
        fs.ensureDirSync(getMediaLibraryVideoDir());
    };

    const removeMediaLibraryFile = (filename) => {
        if (!filename || !isSafePathSegment(filename)) return;
        const candidates = [
            path.join(getMediaLibraryDir('original'), filename),
            path.join(getMediaLibraryDir('large'), filename),
            path.join(getMediaLibraryDir('medium'), filename),
            path.join(getMediaLibraryDir('thumb'), filename),
            path.join(getMediaLibraryVideoDir(), filename)
        ];
        candidates.forEach((filePath) => {
            if (!fs.existsSync(filePath)) return;
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                logger.error(`Failed to delete media library file: ${filePath}`, err);
            }
        });
    };

    // 从 markdown 字符串中提取所有引用了 media_library 的文件名
    const extractReferencedFilenames = (markdown) => {
        const filenames = new Set();
        if (typeof markdown !== 'string' || !markdown) return filenames;
        // 匹配 media_library/<size>/<filename>，filename 是最后一个路径段
        const regex = /media_library\/[^\/?\s"'<>()]+\/([^\/?\s"'<>()]+)/g;
        let match;
        while ((match = regex.exec(markdown)) !== null) {
            filenames.add(match[1]);
        }
        return filenames;
    };

    // 扫描数据库中所有 markdown 文本框，收集被引用的文件名
    const collectReferencedFilenames = () => {
        const referenced = new Set();
        const queries = [
            'SELECT report_markdown AS a, published_report_markdown AS b FROM collections',
            'SELECT report_markdown AS a, published_report_markdown AS b FROM media',
            'SELECT markdown AS a, published_markdown AS b FROM collection_blocks'
        ];
        queries.forEach((sql) => {
            try {
                const rows = db.prepare(sql).all();
                rows.forEach((row) => {
                    Object.values(row || {}).forEach((value) => {
                        extractReferencedFilenames(value).forEach((fn) => referenced.add(fn));
                    });
                });
            } catch (err) {
                logger.error('Media library scan failed:', err);
            }
        });
        return referenced;
    };

    // 列出 media library 文件夹中所有文件名
    const listAllFiles = () => {
        const files = new Set();
        const dirs = [
            getMediaLibraryDir('original'),
            getMediaLibraryDir('large'),
            getMediaLibraryDir('medium'),
            getMediaLibraryDir('thumb'),
            getMediaLibraryVideoDir()
        ];
        dirs.forEach((dir) => {
            if (!fs.existsSync(dir)) return;
            try {
                fs.readdirSync(dir).forEach((filename) => {
                    if (isSafePathSegment(filename)) files.add(filename);
                });
            } catch (err) {
                logger.error(`Failed to list media library dir: ${dir}`, err);
            }
        });
        return files;
    };

    // 清理孤儿文件：磁盘上存在但未被任何 markdown 文本框引用
    const cleanupOrphanedFiles = () => {
        try {
            const referenced = collectReferencedFilenames();
            const onDisk = listAllFiles();
            const orphans = Array.from(onDisk).filter((fn) => !referenced.has(fn));
            orphans.forEach((filename) => {
                removeMediaLibraryFile(filename);
                logger.info(`Media library: removed orphan file ${filename}`);
            });
            return orphans.length;
        } catch (err) {
            logger.error('Media library cleanup failed:', err);
            return 0;
        }
    };

    return {
        getMediaLibraryRootDir,
        getMediaLibraryDir,
        getMediaLibraryVideoDir,
        getMediaLibraryUrl,
        ensureDirs,
        removeMediaLibraryFile,
        cleanupOrphanedFiles,
        extractReferencedFilenames,
        collectReferencedFilenames,
        listAllFiles
    };
};

module.exports = {
    createMediaLibraryService
};

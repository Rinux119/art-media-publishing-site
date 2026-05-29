const calculateProcessingSteps = ({ files, isVideoFile, isImageFile } = {}) => {
    return (Array.isArray(files) ? files : []).reduce((sum, file) => {
        if (!file || !file.originalname) return sum;
        if (isVideoFile(file.originalname)) return sum + 1;
        if (isImageFile(file.originalname)) return sum + 4;
        return sum;
    }, 0);
};

const cleanupUploadedTempFiles = ({ files, unlinkSync }) => {
    (Array.isArray(files) ? files : []).forEach((file) => {
        const filePath = file && file.path;
        if (!filePath) return;
        try {
            unlinkSync(filePath);
        } catch (_) {}
    });
};

const ensureVideoProcessingAvailableForFiles = async ({
    files,
    isVideoFile,
    isFfmpegAvailable,
    cleanupUploadedFiles
} = {}) => {
    if (!(Array.isArray(files) ? files : []).some((file) => file && file.originalname && isVideoFile(file.originalname))) {
        return true;
    }

    try {
        const ok = await isFfmpegAvailable();
        if (ok) return true;
    } catch (_) {}

    if (typeof cleanupUploadedFiles === 'function') {
        cleanupUploadedFiles();
    }
    return false;
};

const createJobProgressUpdater = ({ job, bumpProcessingJob }) => {
    return ({ done = 0, failed = 0, label = '' } = {}) => {
        if (!job) return;
        if (!done && !failed && !label) return;
        bumpProcessingJob(job.id, { done, failed, label });
    };
};

const enqueueRootMediaPostProcessing = ({
    files,
    job,
    bumpProcessingJob,
    isVideoFile,
    isImageFile,
    enqueueBackgroundVideoTask,
    enqueueBackgroundImageTask,
    processUploadedVideo,
    ensureImageVariants,
    compressOriginalImageInPlace,
    getVideoPath,
    getVideoOutputDir,
    getOriginalImagePath
} = {}) => {
    const updateProgress = createJobProgressUpdater({ job, bumpProcessingJob });

    (Array.isArray(files) ? files : []).forEach((file) => {
        if (!file || !file.filename || !file.originalname) return;
        if (isVideoFile(file.originalname)) {
            enqueueBackgroundVideoTask(async () => {
                updateProgress({ label: '正在转码: ' + file.originalname });
                const ok = await processUploadedVideo(getVideoPath(file.filename), getVideoOutputDir(), { throwOnError: false });
                updateProgress(ok ? { done: 1, label: '已完成: ' + file.originalname } : { failed: 1, label: '转码失败: ' + file.originalname });
            });
            return;
        }
        if (isImageFile(file.originalname)) {
            enqueueBackgroundImageTask(async () => {
                updateProgress({ label: '正在处理: ' + file.originalname });
                await ensureImageVariants(file.filename, {
                    priority: 'low',
                    onStep: () => updateProgress({ done: 1 })
                });
                await compressOriginalImageInPlace(getOriginalImagePath(file.filename), { priority: 'low' });
                updateProgress({ done: 1, label: '已完成: ' + file.originalname });
            });
        }
    });
};

const enqueueCollectionMediaPostProcessing = ({
    files,
    collectionSlug,
    job,
    bumpProcessingJob,
    isVideoFile,
    isImageFile,
    enqueueBackgroundVideoTask,
    enqueueBackgroundImageTask,
    processUploadedVideo,
    ensureImageVariants,
    compressOriginalImageInPlace,
    getVideoPath,
    getCollectionOutputDir,
    getOriginalImagePath
} = {}) => {
    const updateProgress = createJobProgressUpdater({ job, bumpProcessingJob });

    (Array.isArray(files) ? files : []).forEach((file) => {
        if (!file || !file.filename || !file.originalname) return;
        if (isVideoFile(file.originalname)) {
            enqueueBackgroundVideoTask(async () => {
                updateProgress({ label: '正在转码: ' + file.originalname });
                const ok = await processUploadedVideo(getVideoPath(collectionSlug, file.filename), getCollectionOutputDir(collectionSlug), { throwOnError: false });
                updateProgress(ok ? { done: 1, label: '已完成: ' + file.originalname } : { failed: 1, label: '转码失败: ' + file.originalname });
            });
            return;
        }
        if (isImageFile(file.originalname)) {
            enqueueBackgroundImageTask(async () => {
                updateProgress({ label: '正在处理: ' + file.originalname });
                await ensureImageVariants(collectionSlug, file.filename, {
                    priority: 'low',
                    onStep: () => updateProgress({ done: 1 })
                });
                await compressOriginalImageInPlace(getOriginalImagePath(collectionSlug, file.filename), { priority: 'low' });
                updateProgress({ done: 1, label: '已完成: ' + file.originalname });
            });
        }
    });
};

module.exports = {
    calculateProcessingSteps,
    cleanupUploadedTempFiles,
    ensureVideoProcessingAvailableForFiles,
    enqueueRootMediaPostProcessing,
    enqueueCollectionMediaPostProcessing
};

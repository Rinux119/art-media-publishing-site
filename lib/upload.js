const { UploadFileTypeError } = require('./http-utils');

const createUploadConfig = ({
    multer,
    fs,
    path,
    getFileExt,
    imageExtensions,
    videoExtensions,
    maxUploadFileSizeBytes,
    getCollectionImagesRootDir,
    getCollectionMediaDir,
    getRootImagesDir
} = {}) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const { collectionSlug } = req.params;
            const ext = getFileExt(file && file.originalname);
            const nextIsImage = imageExtensions.has(ext) && /^image\//i.test(file.mimetype || '');
            const nextIsVideo = videoExtensions.has(ext) && /^video\//i.test(file.mimetype || '');

            let uploadPath;
            if (nextIsVideo) {
                uploadPath = collectionSlug
                    ? path.join(getCollectionImagesRootDir(collectionSlug), 'video')
                    : path.join(getRootImagesDir(), 'video');
            } else if (nextIsImage) {
                uploadPath = collectionSlug
                    ? getCollectionMediaDir(collectionSlug, 'original')
                    : getRootImagesDir('original');
            } else {
                uploadPath = collectionSlug
                    ? getCollectionMediaDir(collectionSlug, 'large')
                    : getRootImagesDir(null);
            }

            fs.ensureDirSync(uploadPath);
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = getFileExt(file && file.originalname);
            const nextIsVideo = videoExtensions.has(ext) && /^video\//i.test(file.mimetype || '');
            cb(null, uniqueSuffix + (nextIsVideo ? '.mp4' : ext));
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: maxUploadFileSizeBytes },
        fileFilter: (req, file, cb) => {
            const ext = getFileExt(file.originalname);
            const isAllowedImage = imageExtensions.has(ext) && /^image\//i.test(file.mimetype || '');
            const isAllowedVideo = videoExtensions.has(ext) && /^video\//i.test(file.mimetype || '');
            if (isAllowedImage || isAllowedVideo) return cb(null, true);
            return cb(new UploadFileTypeError('Only images/videos are allowed (jpg, jpeg, png, gif, mp4, mov)'));
        }
    });

    return {
        storage,
        upload
    };
};

module.exports = {
    createUploadConfig
};

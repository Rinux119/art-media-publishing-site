class UploadFileTypeError extends Error {
    constructor(message = 'Unsupported file type') {
        super(message);
        this.name = 'UploadFileTypeError';
    }
}

class FileSizeExceededError extends Error {
    constructor(message = 'File size exceeds limit') {
        super(message);
        this.name = 'FileSizeExceededError';
    }
}

const wantsJson = (req) => {
    if (!req) return false;
    if (req.query && (req.query.json === '1' || req.query.format === 'json')) return true;
    if (req.xhr) return true;
    const xrw = req.headers && req.headers['x-requested-with'];
    if (typeof xrw === 'string' && xrw.toLowerCase() === 'xmlhttprequest') return true;
    const accept = req.headers && req.headers.accept;
    if (typeof accept === 'string' && accept.toLowerCase().includes('application/json')) return true;
    return false;
};

const renderUploadError = (req, res, message, statusCode = 400) => {
    if (wantsJson(req)) {
        return res.status(statusCode).json({ success: false, error: message });
    }
    const safeMessage = (typeof message === 'string' ? message : String(message))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return res.status(statusCode).send(
        `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上传错误</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;color:#333}.error-card{background:#fff;border-radius:8px;padding:2rem 2.5rem;max-width:420px;width:90%;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center}.error-icon{font-size:2.5rem;margin-bottom:1rem}.error-message{font-size:1rem;line-height:1.6;margin-bottom:1.5rem;color:#555}.back-link{display:inline-block;padding:.5rem 1.5rem;background:#333;color:#fff;text-decoration:none;border-radius:4px;font-size:.875rem;transition:background .2s}.back-link:hover{background:#555}</style></head><body><div class="error-card"><div class="error-icon">&#9888;</div><div class="error-message">${safeMessage}</div><a href="javascript:history.back()" class="back-link">返回</a></div></body></html>`
    );
};

const createUploadMiddlewareErrorHandler = ({ multer, renderUploadError }) => {
    return (err, req, res, next) => {
        if (!err) return next();

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return renderUploadError(req, res, '上传失败：单个文件不能超过 300MB。');
        }

        if (err instanceof UploadFileTypeError) {
            return renderUploadError(req, res, '上传失败：仅支持图片（jpg、jpeg、png、gif）和视频（mp4、mov）。');
        }

        return next(err);
    };
};

const createArrayUploadRunner = ({ upload, handleUploadMiddlewareError }) => {
    return (fieldName) => (req, res, next) => {
        upload.array(fieldName)(req, res, (err) => handleUploadMiddlewareError(err, req, res, next));
    };
};

module.exports = {
    UploadFileTypeError,
    FileSizeExceededError,
    wantsJson,
    renderUploadError,
    createUploadMiddlewareErrorHandler,
    createArrayUploadRunner
};

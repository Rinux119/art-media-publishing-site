const path = require('path');
const fs = require('fs-extra');
const dotenv = require('dotenv');

const isExistingDirectory = (dir) => {
    try {
        if (!dir || !fs.existsSync(dir)) return false;
        return fs.statSync(dir).isDirectory();
    } catch (_) {
        return false;
    }
};

const loadEnvFiles = ({ baseDir = process.cwd() } = {}) => {
    const fromEnv = typeof process.env.ENV_FILE === 'string' ? process.env.ENV_FILE.trim() : '';
    if (fromEnv) {
        const resolved = path.resolve(fromEnv);
        try {
            if (fs.existsSync(resolved)) {
                dotenv.config({ path: resolved, override: true });
                return resolved;
            }
        } catch (_) {}
    }

    const candidates = [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '..', '.env'),
        path.join(baseDir, '.env'),
        path.join(baseDir, '..', '.env')
    ];
    const seen = new Set();
    for (const candidate of candidates) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        try {
            if (fs.existsSync(candidate)) {
                dotenv.config({ path: candidate });
            }
        } catch (_) {}
    }

    return null;
};

const resolveContentRoot = ({ baseDir = process.cwd() } = {}) => {
    if (process.env.CONTENT_ROOT) return path.resolve(process.env.CONTENT_ROOT);

    const candidates = [
        path.join(baseDir, 'content'),
        path.join(process.cwd(), 'content'),
        path.join(baseDir, '..', 'content')
    ];

    for (const dir of candidates) {
        if (isExistingDirectory(dir)) return dir;
    }

    return path.join(baseDir, 'content');
};

module.exports = {
    loadEnvFiles,
    resolveContentRoot
};

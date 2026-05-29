const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const MIN_NODE_MAJOR = 18;
const MIN_NODE_MINOR = 17;

function checkNodeVersion() {
    const version = process.version;
    const parts = version.slice(1).split('.');
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);

    if (major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR)) {
        console.log(`[setup] Node.js ${version} OK (>= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR})`);
        return true;
    }

    console.error(`[setup] Node.js ${version} does not meet requirements (>= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}).`);
    console.error('[setup] Please upgrade: https://nodejs.org/');
    return false;
}

function ensureEnvFile(baseDir) {
    const envPath = path.join(baseDir, '.env');
    const examplePath = path.join(baseDir, '.env.example');

    if (fs.existsSync(envPath)) {
        console.log('[setup] .env already exists, skipping.');
        return;
    }

    if (!fs.existsSync(examplePath)) {
        const secret = crypto.randomBytes(32).toString('hex');
        const resetKey = crypto.randomBytes(16).toString('hex');
        const content = [
            'PORT=3000',
            'NODE_ENV=development',
            `SESSION_SECRET=${secret}`,
            `RESET_KEY=${resetKey}`,
            'DEFAULT_ADMIN_USERNAME=admin',
            ''
        ].join('\n');
        fs.writeFileSync(envPath, content, 'utf8');
        console.log('[setup] Created .env with generated secrets.');
        return;
    }

    let content = fs.readFileSync(examplePath, 'utf8');
    content = content.replace(
        /SESSION_SECRET=replace-with-a-long-random-secret/,
        `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`
    );
    content = content.replace(
        /RESET_KEY=replace-with-a-strong-reset-key/,
        `RESET_KEY=${crypto.randomBytes(16).toString('hex')}`
    );
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[setup] Created .env from .env.example with generated secrets.');
}

function ensureDependencies(baseDir) {
    const nodeModulesPath = path.join(baseDir, 'node_modules');
    const packageJsonPath = path.join(baseDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        console.warn('[setup] package.json not found, skipping dependency installation.');
        return;
    }

    if (fs.existsSync(nodeModulesPath)) {
        console.log('[setup] node_modules exists, skipping npm install.');
        return;
    }

    console.log('[setup] Installing dependencies (this may take a moment)...');
    try {
        execSync('npm install', { cwd: baseDir, stdio: 'inherit' });
        console.log('[setup] Dependencies installed.');
    } catch (err) {
        console.error('[setup] Failed to install dependencies:', err.message);
        throw err;
    }
}

function checkFfmpeg(baseDir) {
    const isWin = process.platform === 'win32';
    const binName = isWin ? '.exe' : '';

    let ffmpegFound = false;
    let ffprobeFound = false;

    const localFfmpeg = path.join(baseDir, 'bin', `ffmpeg${binName}`);
    const localFfprobe = path.join(baseDir, 'bin', `ffprobe${binName}`);
    if (fs.existsSync(localFfmpeg)) ffmpegFound = true;
    if (fs.existsSync(localFfprobe)) ffprobeFound = true;

    if (!ffmpegFound) {
        try {
            const p = require('ffmpeg-static');
            if (p && typeof p === 'string' && fs.existsSync(p)) ffmpegFound = true;
        } catch (_) {}
    }

    if (!ffprobeFound) {
        try {
            const mod = require('@ffprobe-installer/ffprobe');
            const p = (mod && typeof mod === 'string') ? mod : (mod && mod.path);
            if (p && typeof p === 'string' && fs.existsSync(p)) ffprobeFound = true;
        } catch (_) {}
    }

    if (!ffmpegFound) {
        try {
            const cmd = isWin ? 'where' : 'which';
            const result = execSync(`${cmd} ffmpeg${binName}`, { encoding: 'utf8', stdio: 'pipe' });
            if (result && result.trim()) ffmpegFound = true;
        } catch (_) {}
    }

    if (!ffprobeFound) {
        try {
            const cmd = isWin ? 'where' : 'which';
            const result = execSync(`${cmd} ffprobe${binName}`, { encoding: 'utf8', stdio: 'pipe' });
            if (result && result.trim()) ffprobeFound = true;
        } catch (_) {}
    }

    if (ffmpegFound && ffprobeFound) {
        console.log('[setup] FFmpeg & FFprobe are available.');
    } else {
        console.warn('[setup] FFmpeg/FFprobe not found; video compression will be disabled.');
        console.warn('[setup] To enable video processing, install FFmpeg:');
        if (isWin) {
            console.warn('         choco install ffmpeg   (or download from https://ffmpeg.org/)');
        } else if (process.platform === 'darwin') {
            console.warn('         brew install ffmpeg');
        } else {
            console.warn('         sudo apt install ffmpeg   (or equivalent for your distro)');
        }
        console.warn('         Or place ffmpeg/ffprobe binaries in the project bin/ directory.');
    }

    return ffmpegFound && ffprobeFound;
}

async function runSetup(baseDir) {
    console.log('');
    console.log('=== Art Media Publishing Site Setup ===');
    console.log('');

    if (!checkNodeVersion()) {
        process.exit(1);
    }

    ensureEnvFile(baseDir);
    ensureDependencies(baseDir);
    checkFfmpeg(baseDir);

    console.log('');
    console.log('=== Setup Complete ===');
    console.log('');
    console.log('Run `npm start` or `node server.js` to start the server.');
    console.log('Default admin: http://localhost:3000/admin/login');
    console.log('');
}

module.exports = {
    checkNodeVersion,
    ensureEnvFile,
    ensureDependencies,
    checkFfmpeg,
    runSetup
};

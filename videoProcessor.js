const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

class Semaphore {
    constructor(max) {
        this.max = Math.max(1, Number(max) || 1);
        this.active = 0;
        this.queue = [];
    }

    async with(fn) {
        if (typeof fn !== 'function') return;
        if (this.active >= this.max) {
            await new Promise((resolve) => this.queue.push(resolve));
        }
        this.active += 1;
        try {
            return await fn();
        } finally {
            this.active -= 1;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}

const VIDEO_PROCESS_CONCURRENCY = (() => {
    const raw = process.env.VIDEO_PROCESS_CONCURRENCY;
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isNaN(parsed) && parsed > 0) return Math.floor(parsed);
    return 1;
})();

const videoSemaphore = new Semaphore(VIDEO_PROCESS_CONCURRENCY);

const videoInfoCache = new Map();
const VIDEO_INFO_CACHE_MAX = 64;
const VIDEO_INFO_CACHE_TTL_MS = 30_000;

const getCachedVideoInfo = async (inputPath) => {
    const stat = await fs.stat(inputPath);
    const cacheKey = `${inputPath}:${stat.size}:${stat.mtimeMs}`;
    const cached = videoInfoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < VIDEO_INFO_CACHE_TTL_MS) {
        return cached.data;
    }
    const data = await getVideoInfo(inputPath);
    if (videoInfoCache.size >= VIDEO_INFO_CACHE_MAX) {
        const oldest = videoInfoCache.keys().next().value;
        videoInfoCache.delete(oldest);
    }
    videoInfoCache.set(cacheKey, { data, ts: Date.now() });
    return data;
};

const FFMPEG_CONFIG = {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    maxWidth: 1920,
    maxHeight: 1080,
    audioBitrate: '128k',
    videoBitrate: '2000k',
    maxrate: '2500k',
    bufsize: '5000k',
    threads: (() => {
        const raw = process.env.FFMPEG_THREADS;
        const parsed = raw ? Number(raw) : NaN;
        if (!Number.isNaN(parsed) && parsed > 0) return Math.floor(parsed);
        return 4;
    })(),
    preset: 'slow',
    crf: 23,
    profile: 'high',
    level: '4.1'
};

let _mediaConfigOverrides = {};

function updateMediaConfig(config) {
    _mediaConfigOverrides = {};
    if (!config) return;
    if (config.videoCrf !== undefined) _mediaConfigOverrides.crf = Number(config.videoCrf);
    if (config.videoBitrate) _mediaConfigOverrides.videoBitrate = config.videoBitrate;
    if (config.videoAudioBitrate) _mediaConfigOverrides.audioBitrate = config.videoAudioBitrate;
    if (config.videoMaxrate) _mediaConfigOverrides.maxrate = config.videoMaxrate;
    if (config.videoMaxResolution) {
        const parts = String(config.videoMaxResolution).split('x');
        const w = Number(parts[0]);
        const h = Number(parts[1]);
        if (w > 0 && h > 0) {
            _mediaConfigOverrides.maxWidth = w;
            _mediaConfigOverrides.maxHeight = h;
        }
    }
    if (config.videoPreset) _mediaConfigOverrides.preset = config.videoPreset;
}

let ffmpegAvailable = null;
let ffmpegProbe = { ffmpegPath: null, ffprobePath: null };

const resolveBinaryPath = (name) => {
    const fromEnvKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
    const envValue = typeof process.env[fromEnvKey] === 'string' ? process.env[fromEnvKey].trim() : '';
    if (envValue) return envValue;

    const isWin = process.platform === 'win32';
    const binName = isWin ? `${name}.exe` : name;

    const localBinCandidate = path.join(__dirname, 'bin', binName);
    if (fs.existsSync(localBinCandidate)) {
        if (!isWin) {
            try { fs.accessSync(localBinCandidate, fs.constants.X_OK); return localBinCandidate; } catch (_) {}
        } else {
            return localBinCandidate;
        }
    }

    if (name === 'ffmpeg') {
        try {
            const mod = require('ffmpeg-static');
            const p = (mod && typeof mod === 'object' && mod.path) ? mod.path : ((typeof mod === 'string') ? mod : null);
            if (p && typeof p === 'string' && fs.existsSync(p)) return p;
        } catch (_) {}
    }

    if (name === 'ffprobe') {
        try {
            const mod = require('@ffprobe-installer/ffprobe');
            const p = (mod && typeof mod === 'object' && mod.path) ? mod.path : ((typeof mod === 'string') ? mod : null);
            if (p && typeof p === 'string') {
                if (fs.existsSync(p)) return p;
                if (isWin && !p.toLowerCase().endsWith('.exe')) {
                    const exePath = p + '.exe';
                    if (fs.existsSync(exePath)) return exePath;
                }
            }
        } catch (_) {}
    }

    const cmd = isWin ? 'where' : 'which';
    try {
        const which = spawnSync(cmd, [name], { encoding: 'utf8' });
        if (which.status === 0) {
            const p = String(which.stdout || '').trim();
            if (p) {
                if (isWin) {
                    const first = p.split(/\r?\n/)[0].trim();
                    if (first) return first;
                } else {
                    return p;
                }
            }
        }
    } catch (_) {}

    if (isWin) {
        const nameExe = `${name}.exe`;
        const which2 = spawnSync('where', [nameExe], { encoding: 'utf8' });
        if (which2.status === 0) {
            const p = String(which2.stdout || '').trim();
            if (p) {
                const first = p.split(/\r?\n/)[0].trim();
                if (first) return first;
            }
        }
    }

    const commonCandidates = name === 'ffmpeg'
        ? (isWin
            ? ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe']
            : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/snap/bin/ffmpeg'])
        : (isWin
            ? ['C:\\ffmpeg\\bin\\ffprobe.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe', 'C:\\ProgramData\\chocolatey\\bin\\ffprobe.exe']
            : ['/usr/bin/ffprobe', '/usr/local/bin/ffprobe', '/bin/ffprobe', '/opt/homebrew/bin/ffprobe', '/snap/bin/ffprobe']);
    for (const candidate of commonCandidates) {
        try {
            if (!candidate || !fs.existsSync(candidate)) continue;
            if (!isWin) fs.accessSync(candidate, fs.constants.X_OK);
            return candidate;
        } catch (_) {}
    }
    return name;
};

const configureFfmpegBinaries = () => {
    const ffmpegPath = resolveBinaryPath('ffmpeg');
    const ffprobePath = resolveBinaryPath('ffprobe');
    ffmpegProbe = { ffmpegPath, ffprobePath };
    console.log(`[videoProcessor] ffmpeg: ${ffmpegPath}`);
    console.log(`[videoProcessor] ffprobe: ${ffprobePath}`);
};

configureFfmpegBinaries();

const isFfmpegAvailable = () => {
    if (ffmpegAvailable !== null) return ffmpegAvailable;

    const isWin = process.platform === 'win32';
    const spawnOpts = isWin ? { stdio: 'ignore', windowsHide: true } : { stdio: 'ignore' };

    const ffmpegResult = spawnSync(ffmpegProbe.ffmpegPath || 'ffmpeg', ['-version'], spawnOpts);
    const ffprobeResult = spawnSync(ffmpegProbe.ffprobePath || 'ffprobe', ['-version'], spawnOpts);

    console.log(`[videoProcessor] ffmpeg -version: exit=${ffmpegResult.status}, error=${ffmpegResult.error ? ffmpegResult.error.message : 'none'}`);
    console.log(`[videoProcessor] ffprobe -version: exit=${ffprobeResult.status}, error=${ffprobeResult.error ? ffprobeResult.error.message : 'none'}`);

    ffmpegAvailable = ffmpegResult.status === 0 && ffprobeResult.status === 0;
    if (!ffmpegAvailable) {
        console.warn('FFmpeg/ffprobe not found; video compression is disabled.');
        if (ffmpegResult.status === 0 && ffprobeResult.status !== 0) {
            console.warn('  ffmpeg is available but ffprobe is NOT. Video processing requires both.');
        }
        if (ffprobeResult.status === 0 && ffmpegResult.status !== 0) {
            console.warn('  ffprobe is available but ffmpeg is NOT. Video processing requires both.');
        }
    }
    return Promise.resolve(ffmpegAvailable);
};

const getVideoInfo = (inputPath) => {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath
        ];

        const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
        if (process.platform === 'win32') spawnOpts.windowsHide = true;
        const proc = spawn(ffmpegProbe.ffprobePath || 'ffprobe', args, spawnOpts);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        proc.on('error', (err) => {
            const wrapped = new Error(`FFPROBE_FAILED: ${err.message || String(err)}`);
            wrapped.cause = err;
            reject(wrapped);
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                const wrapped = new Error(`FFPROBE_FAILED: ${stderr.trim() || `exit ${code}`}`);
                reject(wrapped);
                return;
            }
            try {
                const json = JSON.parse(stdout || '{}');
                resolve(json);
            } catch (err) {
                const wrapped = new Error(`FFPROBE_FAILED: invalid json output`);
                wrapped.cause = err;
                reject(wrapped);
            }
        });
    });
};

const compressToMP4 = async (inputPath, outputPath, options = {}) => {
    if (!await isFfmpegAvailable()) return false;

    const config = { ...FFMPEG_CONFIG, ..._mediaConfigOverrides, ...options };
    const maxrateNum = parseInt(String(config.maxrate || '2500k'), 10);
    if (!config.bufsize) config.bufsize = `${maxrateNum * 2}k`;

    return new Promise((resolve, reject) => {
        const vf = `scale='min(${config.maxWidth || 1920},iw)':'min(${config.maxHeight || 1080},ih)':force_original_aspect_ratio=decrease`;
        const args = [
            '-y',
            '-i', inputPath,
            '-dn',
            '-sn',
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-vf', vf,
            '-c:v', config.videoCodec,
            '-preset', String(config.preset || 'slow'),
            '-profile:v', String(config.profile || 'high'),
            '-level', String(config.level || '4.1'),
            '-pix_fmt', 'yuv420p',
            '-threads', String(Math.max(1, Number(config.threads) || 4)),
            '-crf', String(config.crf ?? 23),
            '-b:v', String(config.videoBitrate || '2000k'),
            '-maxrate', String(config.maxrate || '2500k'),
            '-bufsize', String(config.bufsize || '5000k'),
            '-g', '60',
            '-keyint_min', '60',
            '-sc_threshold', '0',
            '-c:a', config.audioCodec,
            '-b:a', config.audioBitrate,
            '-movflags', '+faststart',
            outputPath
        ];

        const transcodeOpts = { stdio: ['ignore', 'ignore', 'pipe'] };
        if (process.platform === 'win32') transcodeOpts.windowsHide = true;
        const proc = spawn(ffmpegProbe.ffmpegPath || 'ffmpeg', args, transcodeOpts);
        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        proc.on('error', (err) => {
            const wrapped = new Error(`FFMPEG_TRANSCODE_FAILED: ${err.message || String(err)}`);
            wrapped.cause = err;
            reject(wrapped);
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                const tail = stderr.trim().split('\n').slice(-8).join(' | ');
                reject(new Error(`FFMPEG_TRANSCODE_FAILED: ${tail || `exit ${code}`}`));
                return;
            }
            resolve(outputPath);
        });
    });
};

const compressVideoInPlaceInternal = async (inputPath) => {
    if (!await isFfmpegAvailable()) throw new Error('FFMPEG_OR_FFPROBE_NOT_AVAILABLE');

    if (!await fs.pathExists(inputPath)) {
        throw new Error('INPUT_VIDEO_NOT_FOUND');
    }

    let tempPath = null;
    try {
        tempPath = `${inputPath}.temp-${crypto.randomBytes(8).toString('hex')}.mp4`;

        await compressToMP4(inputPath, tempPath);

        if (!await fs.pathExists(tempPath)) {
            throw new Error('Compressed video file not created');
        }

        const compressedInfo = await getCachedVideoInfo(tempPath);
        const compressedStream = compressedInfo.streams.find(s => s.codec_type === 'video');

        if (!compressedStream || compressedStream.codec_name !== 'h264') {
            throw new Error('Video compression failed - invalid output format');
        }

        const originalStats = await fs.stat(inputPath);
        const compressedStats = await fs.stat(tempPath);

        console.log(`Original size: ${(originalStats.size / 1024 / 1024).toFixed(2)}MB`);
        console.log(`Compressed size: ${(compressedStats.size / 1024 / 1024).toFixed(2)}MB`);
        console.log(`Compression ratio: ${((1 - compressedStats.size / originalStats.size) * 100).toFixed(1)}%`);

        if (compressedStats.size >= originalStats.size) {
            const originalInfo = await getCachedVideoInfo(inputPath);
            const originalStream = originalInfo.streams.find(s => s.codec_type === 'video');
            const isOriginalH264 = originalStream && originalStream.codec_name === 'h264';
            const isOriginalMP4 = /\.mp4$/i.test(inputPath);

            if (isOriginalH264 && isOriginalMP4) {
                console.log('Compressed file is not smaller than original, keeping original H.264 MP4');
                await fs.remove(tempPath);
                tempPath = null;
                return true;
            }
        }

        await fs.remove(inputPath);
        const mp4Path = inputPath.replace(/\.[^/.]+$/, '.mp4');
        await fs.move(tempPath, mp4Path, { overwrite: true });
        tempPath = null;

        console.log(`Video compression and replacement completed successfully: ${mp4Path}`);
        return true;

    } catch (error) {
        console.error('Video compression failed:', error);
        if (tempPath && await fs.pathExists(tempPath)) {
            try { await fs.remove(tempPath); } catch (_) {}
        }

        throw error;
    }
};

const compressVideoInPlace = async (inputPath) => {
    return videoSemaphore.with(() => compressVideoInPlaceInternal(inputPath));
};

const ensureVideoDirectory = async (basePath) => {
    const videoDir = path.join(basePath, 'video');
    await fs.ensureDir(videoDir);
    return videoDir;
};

const processUploadedVideo = async (filePath, targetDir, options = {}) => {
    try {
        const videoDir = await ensureVideoDirectory(targetDir);

        const fileName = path.basename(filePath);
        const targetPath = path.join(videoDir, fileName);

        if (filePath === targetPath) {
            await compressVideoInPlace(filePath);
        } else {
            await fs.move(filePath, targetPath, { overwrite: true });
            await compressVideoInPlace(targetPath);
        }

        console.log(`Video processing completed: ${targetPath.replace(/\.[^/.]+$/, '.mp4')}`);
        return true;

    } catch (error) {
        console.error('Video processing failed:', error);

        try {
            const fileName = path.basename(filePath);
            const targetPath = path.join(await ensureVideoDirectory(targetDir), fileName);
            if (await fs.pathExists(targetPath)) {
                await fs.remove(targetPath);
                console.log(`Deleted failed video: ${targetPath}`);
            }
        } catch (deleteErr) {
            console.error('Failed to delete failed video:', deleteErr);
        }

        if (options && options.throwOnError) throw error;
        return false;
    }
};

module.exports = {
    isFfmpegAvailable,
    getVideoInfo,
    compressToMP4,
    compressVideoInPlace,
    ensureVideoDirectory,
    processUploadedVideo,
    updateMediaConfig,
    FFMPEG_CONFIG
};

const net = require('net');

const MAX_VISIT_LOGS = 200;
const SKIP_PATH_PREFIXES = ['/admin', '/resources', '/content'];
const SKIP_EXTENSIONS = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.m3u8', '.ts']);

const normalizeIp = (ip) => {
    if (!ip) return '';
    const first = String(ip).split(',')[0].trim();
    if (!first) return '';
    let candidate = first;
    if (candidate.startsWith('[')) {
        const end = candidate.indexOf(']');
        if (end !== -1) candidate = candidate.slice(1, end);
    } else {
        const colonCount = (candidate.match(/:/g) || []).length;
        if (colonCount <= 1) candidate = candidate.replace(/:\d+$/, '');
    }
    if (candidate.startsWith('::ffff:')) candidate = candidate.slice('::ffff:'.length);
    if (candidate === '::1') candidate = '127.0.0.1';
    if (net.isIP(candidate) === 0) return '';
    return candidate;
};

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return normalizeIp(forwarded);
    return normalizeIp(req.ip);
};

const shouldLog = (req) => {
    if (req.method !== 'GET') return false;
    const reqPath = req.path || '/';
    if (SKIP_PATH_PREFIXES.some((prefix) => reqPath.startsWith(prefix))) return false;
    const dotIndex = reqPath.lastIndexOf('.');
    if (dotIndex !== -1) {
        const ext = reqPath.slice(dotIndex).toLowerCase().split('?')[0];
        if (SKIP_EXTENSIONS.has(ext)) return false;
    }
    return true;
};

const createVisitLogger = ({ db }) => {
    const insertVisit = db.prepare(
        'INSERT INTO visit_logs (ip, path, user_agent, visited_at) VALUES (?, ?, ?, ?)'
    );
    const countVisits = db.prepare('SELECT COUNT(*) AS cnt FROM visit_logs');
    const deleteOldest = db.prepare(
        'DELETE FROM visit_logs WHERE id IN (SELECT id FROM visit_logs ORDER BY id ASC LIMIT ?)'
    );
    const pruneVisits = db.transaction(() => {
        const row = countVisits.get();
        if (row && row.cnt > MAX_VISIT_LOGS) {
            const excess = row.cnt - MAX_VISIT_LOGS;
            deleteOldest.run(excess);
        }
    });

    const visitLoggerMiddleware = (req, res, next) => {
        if (!shouldLog(req)) return next();
        const ip = getClientIp(req);
        if (!ip) return next();
        try {
            insertVisit.run(ip, req.path, req.headers['user-agent'] || '', Date.now());
            pruneVisits();
        } catch (_) {}
        next();
    };

    const getRecentVisits = (limit = 10) => {
        return db.prepare(
            'SELECT id, ip, path, visited_at FROM visit_logs ORDER BY visited_at DESC LIMIT ?'
        ).all(limit);
    };

    const getVisitsSorted = (sort = 'date', limit = 200) => {
        if (sort === 'count') {
            return db.prepare(`
                SELECT ip, COUNT(*) AS visit_count, MAX(visited_at) AS last_visited_at
                FROM visit_logs
                GROUP BY ip
                ORDER BY visit_count DESC, last_visited_at DESC
                LIMIT ?
            `).all(limit);
        }
        return db.prepare(
            'SELECT id, ip, path, user_agent, visited_at FROM visit_logs ORDER BY visited_at DESC LIMIT ?'
        ).all(limit);
    };

    const getVisitStats = () => {
        const total = db.prepare('SELECT COUNT(*) AS cnt FROM visit_logs').get();
        const uniqueIps = db.prepare('SELECT COUNT(DISTINCT ip) AS cnt FROM visit_logs').get();
        return {
            totalVisits: total ? total.cnt : 0,
            uniqueIps: uniqueIps ? uniqueIps.cnt : 0
        };
    };

    return {
        visitLoggerMiddleware,
        getRecentVisits,
        getVisitsSorted,
        getVisitStats
    };
};

module.exports = { createVisitLogger };

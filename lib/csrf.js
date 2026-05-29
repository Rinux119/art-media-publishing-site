const crypto = require('crypto');

const generateToken = () => crypto.randomBytes(32).toString('hex');

const TOKEN_LENGTH = 64;

const constantTimeEquals = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};

const csrfMiddleware = (req, res, next) => {
    if (!req.session) return next();

    if (!req.session.csrfToken) {
        req.session.csrfToken = generateToken();
    }

    res.locals.csrfToken = req.session.csrfToken;

    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }

    const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];

    if (!token || !constantTimeEquals(String(token), req.session.csrfToken)) {
        return res.status(403).send('Invalid or missing CSRF token');
    }

    next();
};

module.exports = { csrfMiddleware };

const session = require('express-session');

const STORE_DEFAULTS = {
    tableName: 'sessions',
    cleanupIntervalMs: 15 * 60 * 1000
};

class BetterSqliteSessionStore extends session.Store {
    constructor(db, options = {}) {
        super();
        this.db = db;
        this.tableName = options.tableName || STORE_DEFAULTS.tableName;

        this._stmtGet = this.db.prepare(
            `SELECT data FROM "${this.tableName}" WHERE sid = ? AND expires_at > ?`
        );
        this._stmtSet = this.db.prepare(
            `INSERT INTO "${this.tableName}" (sid, data, expires_at)
             VALUES (?, ?, ?)
             ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
        );
        this._stmtDestroy = this.db.prepare(
            `DELETE FROM "${this.tableName}" WHERE sid = ?`
        );
        this._stmtTouch = this.db.prepare(
            `UPDATE "${this.tableName}" SET expires_at = ? WHERE sid = ?`
        );
        this._stmtCleanup = this.db.prepare(
            `DELETE FROM "${this.tableName}" WHERE expires_at <= ?`
        );

        const cleanupIntervalMs = options.cleanupIntervalMs || STORE_DEFAULTS.cleanupIntervalMs;
        if (cleanupIntervalMs > 0) {
            this._cleanupTimer = setInterval(() => {
                try {
                    this._stmtCleanup.run(Date.now());
                } catch (_) {}
            }, cleanupIntervalMs);
            if (this._cleanupTimer.unref) {
                this._cleanupTimer.unref();
            }
        }
    }

    get(sid, callback) {
        try {
            const row = this._stmtGet.get(sid, Date.now());
            if (!row) return callback(null, null);
            try {
                const data = JSON.parse(row.data);
                return callback(null, data);
            } catch (_) {
                return callback(null, null);
            }
        } catch (err) {
            return callback(err);
        }
    }

    set(sid, sessionData, callback) {
        try {
            const data = JSON.stringify(sessionData);
            let expiresAt;
            if (sessionData.cookie && sessionData.cookie.expires) {
                expiresAt = new Date(sessionData.cookie.expires).getTime();
            } else if (sessionData.cookie && typeof sessionData.cookie.maxAge === 'number') {
                expiresAt = Date.now() + sessionData.cookie.maxAge;
            } else {
                expiresAt = Date.now() + 86400000;
            }
            if (isNaN(expiresAt) || expiresAt <= 0) {
                expiresAt = Date.now() + 86400000;
            }
            this._stmtSet.run(sid, data, expiresAt);
            return callback && callback(null);
        } catch (err) {
            return callback && callback(err);
        }
    }

    destroy(sid, callback) {
        try {
            this._stmtDestroy.run(sid);
            return callback && callback(null);
        } catch (err) {
            return callback && callback(err);
        }
    }

    touch(sid, sessionData, callback) {
        try {
            let expiresAt;
            if (sessionData.cookie && sessionData.cookie.expires) {
                expiresAt = new Date(sessionData.cookie.expires).getTime();
            } else if (sessionData.cookie && typeof sessionData.cookie.maxAge === 'number') {
                expiresAt = Date.now() + sessionData.cookie.maxAge;
            } else {
                expiresAt = Date.now() + 86400000;
            }
            if (isNaN(expiresAt) || expiresAt <= 0) {
                expiresAt = Date.now() + 86400000;
            }
            this._stmtTouch.run(expiresAt, sid);
            return callback && callback(null);
        } catch (err) {
            return callback && callback(err);
        }
    }

    close() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
    }
}

function createSessionStore(db, options) {
    return new BetterSqliteSessionStore(db, options);
}

module.exports = { BetterSqliteSessionStore, createSessionStore };

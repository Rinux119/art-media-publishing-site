const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const Database = require('better-sqlite3');
const { BetterSqliteSessionStore, createSessionStore } = require('../lib/session-store');

const tempRoot = path.join(os.tmpdir(), `session-store-test-${process.pid}-${Date.now()}`);

test.before(async () => {
    await fs.ensureDir(tempRoot);
});

test.after(async () => {
    await fs.remove(tempRoot);
});

test('createSessionStore 返回 BetterSqliteSessionStore 实例', () => {
    const dbPath = path.join(tempRoot, 'create-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = createSessionStore(db);
    assert.ok(store instanceof BetterSqliteSessionStore);
    store.close();
    db.close();
});

test('set + get：存储并读取 session 数据', (t, done) => {
    const dbPath = path.join(tempRoot, 'set-get-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const sessionData = {
        cookie: { maxAge: 86400000, secure: false },
        user: 'admin',
        csrfToken: 'abc123'
    };

    store.set('sid-1', sessionData, (err) => {
        assert.equal(err, null);

        store.get('sid-1', (err, data) => {
            assert.equal(err, null);
            assert.deepEqual(data.user, 'admin');
            assert.deepEqual(data.csrfToken, 'abc123');
            assert.ok(data.cookie);

            store.close();
            db.close();
            done();
        });
    });
});

test('get 返回不存在的 sid 时返回 null', (t, done) => {
    const dbPath = path.join(tempRoot, 'get-missing-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    store.get('nonexistent-sid', (err, data) => {
        assert.equal(err, null);
        assert.equal(data, null);
        store.close();
        db.close();
        done();
    });
});

test('destroy：删除 session 后 get 返回 null', (t, done) => {
    const dbPath = path.join(tempRoot, 'destroy-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const sessionData = { cookie: { maxAge: 86400000 }, user: 'test' };

    store.set('sid-destroy', sessionData, (err) => {
        assert.equal(err, null);

        store.destroy('sid-destroy', (err) => {
            assert.equal(err, null);

            store.get('sid-destroy', (err, data) => {
                assert.equal(err, null);
                assert.equal(data, null);
                store.close();
                db.close();
                done();
            });
        });
    });
});

test('touch：延长过期时间后 session 仍可读取', (t, done) => {
    const dbPath = path.join(tempRoot, 'touch-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const sessionData = { cookie: { maxAge: 1000 }, user: 'test' };

    store.set('sid-touch', sessionData, (err) => {
        assert.equal(err, null);

        const touchedSession = { cookie: { maxAge: 86400000 }, user: 'test' };
        store.touch('sid-touch', touchedSession, (err) => {
            assert.equal(err, null);

            store.get('sid-touch', (err, data) => {
                assert.equal(err, null);
                assert.equal(data.user, 'test');
                store.close();
                db.close();
                done();
            });
        });
    });
});

test('过期 session 在 get 时返回 null', (t, done) => {
    const dbPath = path.join(tempRoot, 'expired-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const pastExpiry = Date.now() - 10000;
    db.prepare(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)`
    ).run('sid-expired', JSON.stringify({ cookie: { maxAge: 1 }, user: 'expired' }), pastExpiry);

    store.get('sid-expired', (err, data) => {
        assert.equal(err, null);
        assert.equal(data, null);
        store.close();
        db.close();
        done();
    });
});

test('set 使用 cookie.expires 计算过期时间', (t, done) => {
    const dbPath = path.join(tempRoot, 'expires-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const futureExpires = new Date(Date.now() + 3600000);
    const sessionData = { cookie: { expires: futureExpires.toISOString() }, user: 'test' };

    store.set('sid-expires', sessionData, (err) => {
        assert.equal(err, null);

        store.get('sid-expires', (err, data) => {
            assert.equal(err, null);
            assert.equal(data.user, 'test');
            store.close();
            db.close();
            done();
        });
    });
});

test('set 覆盖相同 sid 时更新数据', (t, done) => {
    const dbPath = path.join(tempRoot, 'upsert-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db);

    const first = { cookie: { maxAge: 86400000 }, user: 'first' };
    const second = { cookie: { maxAge: 86400000 }, user: 'second' };

    store.set('sid-upsert', first, (err) => {
        assert.equal(err, null);

        store.set('sid-upsert', second, (err) => {
            assert.equal(err, null);

            store.get('sid-upsert', (err, data) => {
                assert.equal(err, null);
                assert.equal(data.user, 'second');
                store.close();
                db.close();
                done();
            });
        });
    });
});

test('cleanup：清理过期 session', (t, done) => {
    const dbPath = path.join(tempRoot, 'cleanup-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db, { cleanupIntervalMs: 0 });

    const now = Date.now();
    db.prepare(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)`
    ).run('sid-old', JSON.stringify({ cookie: {} }), now - 10000);
    db.prepare(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)`
    ).run('sid-fresh', JSON.stringify({ cookie: {} }), now + 86400000);

    store._stmtCleanup.run(now);

    const remaining = db.prepare('SELECT sid FROM sessions').all();
    const remainingSids = remaining.map((r) => r.sid);
    assert.ok(!remainingSids.includes('sid-old'));
    assert.ok(remainingSids.includes('sid-fresh'));

    store.close();
    db.close();
    done();
});

test('close：停止清理定时器后不再持有引用', () => {
    const dbPath = path.join(tempRoot, 'close-test.sqlite');
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store = new BetterSqliteSessionStore(db, { cleanupIntervalMs: 1000 });
    assert.ok(store._cleanupTimer);
    store.close();
    assert.equal(store._cleanupTimer, null);
    db.close();
});

test('session 数据在数据库重启后仍可读取', (t, done) => {
    const dbPath = path.join(tempRoot, 'persist-test.sqlite');

    const db1 = new Database(dbPath);
    db1.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `);
    const store1 = new BetterSqliteSessionStore(db1, { cleanupIntervalMs: 0 });

    const sessionData = { cookie: { maxAge: 86400000 }, user: 'persist-test', csrfToken: 'tok123' };

    store1.set('sid-persist', sessionData, (err) => {
        assert.equal(err, null);
        store1.close();
        db1.close();

        const db2 = new Database(dbPath);
        const store2 = new BetterSqliteSessionStore(db2, { cleanupIntervalMs: 0 });

        store2.get('sid-persist', (err, data) => {
            assert.equal(err, null);
            assert.equal(data.user, 'persist-test');
            assert.equal(data.csrfToken, 'tok123');
            store2.close();
            db2.close();
            done();
        });
    });
});

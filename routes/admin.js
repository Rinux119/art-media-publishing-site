const registerAdminRoutes = ({
    app,
    db,
    fs,
    path,
    net,
    crypto,
    bcrypt,
    contentRoot,
    dataCache,
    wantsJson,
    renderUploadError,
    runArrayUpload,
    cleanupUploadedTempFiles,
    ensureVideoProcessingAvailableForFiles,
    calculateProcessingSteps,
    enqueueRootMediaPostProcessing,
    enqueueCollectionMediaPostProcessing,
    normalizeCollectionDisplayType,
    resolveIndexStoredPathForView,
    isImageFile,
    isVideoFile,
    getProcessingJob,
    createProcessingJob,
    bumpProcessingJob,
    enqueueBackgroundImageTask,
    enqueueBackgroundVideoTask,
    ensureRootImageVariants,
    ensureCollectionImageVariants,
    compressOriginalImageInPlace,
    getCollectionImagesRootDir,
    getCollectionMediaDir,
    getRootImagesDir,
    removeCollectionMediaAssets,
    removeRootMediaAssets,
    invalidateCachedData,
    videoProcessor,
    getRecentVisits,
    getVisitsSorted,
    getVisitStats,
    invalidateSiteConfigCache,
    getMediaConfig
} = {}) => {
    const PASSWD_RESET_MAX_KEY_FAILURES = 3;
    const PASSWD_RESET_LOCK_MS = 24 * 60 * 60 * 1000;
    const ADMIN_LOGIN_MAX_PASSWORD_FAILURES = 3;
    const ADMIN_LOGIN_LOCK_MESSAGE = null;
    const ADMIN_LOGIN_IP_MAX_FAILURES = 10;
    const ADMIN_LOGIN_IP_LOCK_MS = 15 * 60 * 1000;

    const selectNavCollectionsAdmin = db.prepare('SELECT * FROM collections ORDER BY order_index ASC');
    const selectPasswdResetIpLock = db.prepare(
        'SELECT ip, failed_key_count AS failedKeyCount, locked_until AS lockedUntil FROM passwd_reset_ip_lockouts WHERE ip = ?'
    );
    const upsertPasswdResetIpLock = db.prepare(`
        INSERT INTO passwd_reset_ip_lockouts (ip, failed_key_count, locked_until, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
            failed_key_count = excluded.failed_key_count,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
    `);
    const clearPasswdResetIpLock = db.prepare('DELETE FROM passwd_reset_ip_lockouts WHERE ip = ?');
    const selectAdminLoginLockout = db.prepare(
        'SELECT username, failed_password_count AS failedPasswordCount, locked_at AS lockedAt FROM admin_login_lockouts WHERE username = ?'
    );
    const upsertAdminLoginLockout = db.prepare(`
        INSERT INTO admin_login_lockouts (username, failed_password_count, locked_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            failed_password_count = excluded.failed_password_count,
            locked_at = excluded.locked_at,
            updated_at = excluded.updated_at
    `);
    const clearAdminLoginLockout = db.prepare('DELETE FROM admin_login_lockouts WHERE username = ?');

    const selectAdminLoginIpLock = db.prepare(
        'SELECT ip, failed_count AS failedCount, locked_until AS lockedUntil FROM admin_login_ip_lockouts WHERE ip = ?'
    );
    const upsertAdminLoginIpLock = db.prepare(`
        INSERT INTO admin_login_ip_lockouts (ip, failed_count, locked_until, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
            failed_count = excluded.failed_count,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
    `);
    const clearAdminLoginIpLock = db.prepare('DELETE FROM admin_login_ip_lockouts WHERE ip = ?');

    const requireAuth = (req, res, next) => {
        if (req.session.userId) return next();
        return res.redirect('/admin/login');
    };

    const requireAdmin = (req, res, next) => {
        if (!req.session.userId) return res.redirect('/admin/login');
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId);
        if (user && user.username === 'admin') return next();
        if (req.method === 'GET') return res.redirect('/admin?error=not_admin');
        return res.status(403).json({ success: false, error: req.__('admin.login.notAdmin') });
    };

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

    const getCurrentPasswdResetLockInfo = (ip, nowMs) => {
        const row = selectPasswdResetIpLock.get(ip);
        if (!row) return { failedKeyCount: 0, lockedUntil: null };
        if (row.lockedUntil && row.lockedUntil <= nowMs) {
            clearPasswdResetIpLock.run(ip);
            return { failedKeyCount: 0, lockedUntil: null };
        }
        return { failedKeyCount: row.failedKeyCount || 0, lockedUntil: row.lockedUntil || null };
    };

    const renderPasswdReset = (res, params = {}) => res.render('admin/passwd', params);
    const constantTimeEquals = (a, b) => {
        const aBuf = Buffer.from(a || '', 'utf8');
        const bBuf = Buffer.from(b || '', 'utf8');
        if (aBuf.length !== bBuf.length) return false;
        return crypto.timingSafeEqual(aBuf, bBuf);
    };

    app.use('/admin', (req, res, next) => {
        const cacheKey = 'nav:admin';
        const cached = dataCache.getEntry(cacheKey);
        if (cached) {
            res.locals.collections = cached.value;
            return next();
        }

        const collections = selectNavCollectionsAdmin.all();
        dataCache.set(cacheKey, collections, 2_000);
        res.locals.collections = collections;
        return next();
    });

    app.get('/admin/jobs/:jobId', requireAuth, (req, res) => {
        const job = getProcessingJob(req.params.jobId);
        if (!job || job.ownerUserId !== req.session.userId) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }

        return res.json({
            success: true,
            job: {
                id: job.id,
                status: job.status,
                totalSteps: job.totalSteps,
                doneSteps: job.doneSteps,
                failedSteps: job.failedSteps,
                currentStepLabel: job.currentStepLabel || '',
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                redirectUrl: job.redirectUrl
            }
        });
    });

    app.get(['/passwd', '/admin/passwd'], (req, res) => {
        renderPasswdReset(res);
    });

    app.post(['/passwd', '/admin/passwd'], (req, res) => {
        const ip = getClientIp(req);
        const nowMs = Date.now();
        const { lockedUntil, failedKeyCount } = ip
            ? getCurrentPasswdResetLockInfo(ip, nowMs)
            : { lockedUntil: null, failedKeyCount: 0 };

        if (lockedUntil && lockedUntil > nowMs) {
            const unlockAtText = new Date(lockedUntil).toLocaleString('en-US', { hour12: false });
            return renderPasswdReset(res, { error: req.__('admin.passwd.ipLocked', { time: unlockAtText }) });
        }

        const { username, resetKey, newPassword } = req.body;
        const normalizedUsername = (typeof username === 'string' ? username : '').trim();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);

        if (!user) {
            return renderPasswdReset(res, { error: req.__('admin.passwd.userNotFound') });
        }

        const userResetKeyHash = user.reset_key_hash ? user.reset_key_hash.trim() : '';
        if (!userResetKeyHash) {
            return renderPasswdReset(res, { error: req.__('admin.passwd.resetKeyNotConfigured') });
        }

        const normalizedResetKey = (typeof resetKey === 'string' ? resetKey : '').trim();
        const resetKeyOk = bcrypt.compareSync(normalizedResetKey, userResetKeyHash);

        if (!resetKeyOk) {
            const nextCount = failedKeyCount + 1;
            const shouldLock = nextCount >= PASSWD_RESET_MAX_KEY_FAILURES;
            const nextLockedUntil = shouldLock ? (nowMs + PASSWD_RESET_LOCK_MS) : null;

            if (ip) {
                upsertPasswdResetIpLock.run(ip, nextCount, nextLockedUntil, nowMs, nowMs);
            }

            if (shouldLock) {
                return renderPasswdReset(res, { error: req.__('admin.passwd.keyTooManyAttempts') });
            }

            const remaining = PASSWD_RESET_MAX_KEY_FAILURES - nextCount;
            return renderPasswdReset(res, { error: req.__('admin.passwd.keyWrong', { remaining }) });
        }

        if (ip) clearPasswdResetIpLock.run(ip);

        const salt = bcrypt.genSaltSync(10);
        const hashedNewPassword = bcrypt.hashSync(newPassword, salt);

        try {
            db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedNewPassword, normalizedUsername);
            clearAdminLoginLockout.run(normalizedUsername);
            return renderPasswdReset(res, { success: req.__('admin.passwd.resetSuccess') });
        } catch (err) {
            console.error('Password reset error:', err);
            return renderPasswdReset(res, { error: req.__('admin.passwd.resetFailed') });
        }
    });

    app.get('/admin/login', (req, res) => {
        res.render('admin/login');
    });

    app.post('/admin/login', (req, res) => {
        const { username, password } = req.body;
        const normalizedUsername = (typeof username === 'string' ? username : '').trim();
        const nowMs = Date.now();
        const ip = getClientIp(req);

        if (ip) {
            const ipRow = selectAdminLoginIpLock.get(ip);
            if (ipRow && ipRow.lockedUntil && ipRow.lockedUntil > nowMs) {
                const remainingMin = Math.ceil((ipRow.lockedUntil - nowMs) / 60000);
                return res.render('admin/login', { error: req.__('admin.login.ipLocked', { min: remainingMin }) });
            }
            if (ipRow && ipRow.lockedUntil && ipRow.lockedUntil <= nowMs) {
                clearAdminLoginIpLock.run(ip);
            }
        }

        if (normalizedUsername) {
            const lockRow = selectAdminLoginLockout.get(normalizedUsername);
            if (lockRow && lockRow.lockedAt) {
                return res.render('admin/login', { error: req.__('admin.login.accountLocked') });
            }
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.userId = user.id;
            if (normalizedUsername) clearAdminLoginLockout.run(normalizedUsername);
            if (ip) clearAdminLoginIpLock.run(ip);
            return res.redirect('/admin');
        }

        if (!normalizedUsername) {
            return res.render('admin/login', { error: req.__('admin.login.wrongCredentials') });
        }

        const row = selectAdminLoginLockout.get(normalizedUsername);
        const currentFailed = row ? (row.failedPasswordCount || 0) : 0;
        const nextFailed = currentFailed + 1;
        const shouldLock = nextFailed >= ADMIN_LOGIN_MAX_PASSWORD_FAILURES;
        const lockedAt = shouldLock ? nowMs : null;
        upsertAdminLoginLockout.run(normalizedUsername, nextFailed, lockedAt, nowMs, nowMs);

        if (ip) {
            const ipRow = selectAdminLoginIpLock.get(ip);
            const currentIpFailed = ipRow ? (ipRow.failedCount || 0) : 0;
            const nextIpFailed = currentIpFailed + 1;
            const shouldIpLock = nextIpFailed >= ADMIN_LOGIN_IP_MAX_FAILURES;
            const ipLockedUntil = shouldIpLock ? (nowMs + ADMIN_LOGIN_IP_LOCK_MS) : null;
            upsertAdminLoginIpLock.run(ip, nextIpFailed, ipLockedUntil, nowMs, nowMs);
        }

        if (shouldLock) {
            return res.render('admin/login', { error: req.__('admin.login.accountLocked') });
        }

        return res.render('admin/login', { error: req.__('admin.login.wrongCredentials') });
    });

    app.get('/admin/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/admin/login');
    });

    app.get('/admin', requireAuth, (req, res) => {
        const getSettingValue = (key, fallback = '') => {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
            return row && typeof row.value === 'string' ? row.value : fallback;
        };

        const indexImage = resolveIndexStoredPathForView(getSettingValue('index_image', ''), 'large');
        const indexDisplayTypeRaw = getSettingValue('index_display_type', 'single');
        const indexDisplayType = indexDisplayTypeRaw === 'diptych'
            ? 'diptych'
            : (indexDisplayTypeRaw === 'video' ? 'video' : 'single');
        const indexImageLeft = resolveIndexStoredPathForView(getSettingValue('index_image_left', indexImage), 'large');
        const indexImageRight = resolveIndexStoredPathForView(getSettingValue('index_image_right', ''), 'large');
        const collections = db.prepare(`
            SELECT c.*,
              CASE WHEN
                COALESCE(c.report_markdown, '') <> COALESCE(c.published_report_markdown, '')
                OR EXISTS (SELECT 1 FROM media m WHERE m.collection_id = c.id AND m.is_published = 0)
                OR EXISTS (SELECT 1 FROM media m WHERE m.collection_id = c.id AND m.is_deleted_draft = 1)
                OR EXISTS (SELECT 1 FROM media m WHERE m.collection_id = c.id AND COALESCE(m.report_markdown, '') <> COALESCE(m.published_report_markdown, ''))
                OR EXISTS (SELECT 1 FROM media m WHERE m.collection_id = c.id AND m.order_index <> m.published_order_index)
                OR EXISTS (SELECT 1 FROM collection_blocks b WHERE b.collection_id = c.id AND b.is_published = 0)
                OR EXISTS (SELECT 1 FROM collection_blocks b WHERE b.collection_id = c.id AND b.is_deleted_draft = 1)
                OR EXISTS (SELECT 1 FROM collection_blocks b WHERE b.collection_id = c.id AND COALESCE(b.markdown, '') <> COALESCE(b.published_markdown, ''))
                OR EXISTS (SELECT 1 FROM collection_blocks b WHERE b.collection_id = c.id AND COALESCE(b.media_ids, '[]') <> COALESCE(b.published_media_ids, '[]'))
                OR EXISTS (SELECT 1 FROM collection_blocks b WHERE b.collection_id = c.id AND b.order_index <> b.published_order_index)
              THEN 1 ELSE 0 END AS has_pending_draft_changes
            FROM collections c
            ORDER BY c.order_index ASC
        `).all();
        res.render('admin/dashboard', {
            indexImage,
            indexDisplayType,
            indexImageLeft,
            indexImageRight,
            collections,
            easterEggTestUrl: '/?egg_test=1',
            recentVisits: getRecentVisits(10),
            visitStats: getVisitStats(),
            isAdmin: (() => { const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId); return u && u.username === 'admin'; })()
        });
    });

    app.post('/admin/update-index-image', requireAuth, runArrayUpload('indexImages'), async (req, res) => {
        if (req.body.confirmed !== '1') return res.redirect('/admin');

        const indexDisplayTypeRaw = (typeof req.body.index_display_type === 'string' ? req.body.index_display_type : '').toLowerCase();
        const indexDisplayType = indexDisplayTypeRaw === 'diptych'
            ? 'diptych'
            : (indexDisplayTypeRaw === 'video' ? 'video' : 'single');
        const files = Array.isArray(req.files) ? req.files : [];
        const cleanupUploadedFiles = () => cleanupUploadedTempFiles({ files, unlinkSync: fs.unlinkSync });

        if (indexDisplayType === 'diptych') {
            if (files.length !== 2) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.uploadTwoImages'));
            }
            if (files.some((file) => file && file.originalname && !isImageFile(file.originalname))) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.indexImageOnly'));
            }
        } else if (indexDisplayType === 'video') {
            if (files.length !== 1) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.uploadOneVideo'));
            }
            if (files[0] && files[0].originalname && !isVideoFile(files[0].originalname)) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.indexVideoOnly'));
            }
        } else {
            if (files.length !== 1) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.uploadOneImage'));
            }
            if (files.some((file) => file && file.originalname && !isImageFile(file.originalname))) {
                cleanupUploadedFiles();
                return renderUploadError(req, res, req.__('admin.dashboard.indexImageOnly'));
            }
        }

        const isVideoProcessingReady = await ensureVideoProcessingAvailableForFiles({
            files,
            isVideoFile,
            isFfmpegAvailable: videoProcessor.isFfmpegAvailable,
            cleanupUploadedFiles
        });
        if (!isVideoProcessingReady) {
            return renderUploadError(req, res, req.__('admin.dashboard.videoProcessingFailed'), 500);
        }

        const oldTypeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_display_type');
        const oldType = oldTypeRow && oldTypeRow.value === 'diptych'
            ? 'diptych'
            : (oldTypeRow && oldTypeRow.value === 'video' ? 'video' : 'single');
        const oldLeftRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left');
        const oldRightRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_right');
        const oldIndexRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image');
        const oldLeft = oldLeftRow ? oldLeftRow.value : (oldIndexRow ? oldIndexRow.value : null);
        const oldRight = oldRightRow ? oldRightRow.value : null;

        const fileToStoredPath = (file) => {
            if (!file || !file.filename) return '';
            if (file.originalname && isVideoFile(file.originalname)) return `../content/images/video/${file.filename}`;
            return `../content/images/large/${file.filename}`;
        };

        const newLeftPath = fileToStoredPath(files[0]);
        const newRightPath = indexDisplayType === 'diptych' ? fileToStoredPath(files[1]) : '';
        const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        upsertSetting.run('index_display_type', indexDisplayType);
        upsertSetting.run('index_image_left', newLeftPath);
        upsertSetting.run('index_image_right', newRightPath);
        upsertSetting.run('index_image', newLeftPath);

        invalidateCachedData({ settings: true });

        const job = wantsJson(req) ? createProcessingJob({
            ownerUserId: req.session.userId,
            totalSteps: calculateProcessingSteps({ files, isVideoFile, isImageFile }),
            redirectUrl: '/admin'
        }) : null;

        enqueueRootMediaPostProcessing({
            files,
            job,
            bumpProcessingJob,
            isVideoFile,
            isImageFile,
            enqueueBackgroundVideoTask,
            enqueueBackgroundImageTask,
            processUploadedVideo: videoProcessor.processUploadedVideo,
            ensureImageVariants: ensureRootImageVariants,
            compressOriginalImageInPlace,
            getVideoPath: (filename) => path.join(getRootImagesDir(), 'video', filename),
            getVideoOutputDir: () => getRootImagesDir(),
            getOriginalImagePath: (filename) => path.join(getRootImagesDir('original'), filename)
        });

        const newFileNames = new Set([files[0] && files[0].filename, indexDisplayType === 'diptych' ? files[1] && files[1].filename : null].filter(Boolean));
        const oldCandidates = [oldLeft, oldType === 'diptych' ? oldRight : null].filter(Boolean);
        oldCandidates.forEach((storedPath) => {
            const oldFileName = path.basename(storedPath);
            if (!oldFileName || newFileNames.has(oldFileName)) return;
            removeRootMediaAssets(oldFileName);
        });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                redirectUrl: '/admin',
                jobId: job ? job.id : null,
                statusUrl: job ? `/admin/jobs/${job.id}` : null
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/index-images/reorder', requireAuth, (req, res) => {
        const swap = !!(req.body && req.body.swap);
        if (!swap) return res.status(400).json({ success: false, error: 'Invalid request' });

        const typeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_display_type');
        const indexDisplayType = typeRow && typeRow.value === 'diptych' ? 'diptych' : 'single';
        if (indexDisplayType !== 'diptych') {
            return res.status(400).json({ success: false, error: req.__('admin.dashboard.notDiptychMode') });
        }

        const leftRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_left');
        const rightRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('index_image_right');
        const left = leftRow && typeof leftRow.value === 'string' ? leftRow.value : '';
        const right = rightRow && typeof rightRow.value === 'string' ? rightRow.value : '';
        if (!left || !right) {
            return res.status(400).json({ success: false, error: req.__('admin.dashboard.needTwoIndexImages') });
        }

        const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        upsertSetting.run('index_image_left', right);
        upsertSetting.run('index_image_right', left);
        upsertSetting.run('index_image', right);
        invalidateCachedData({ settings: true });
        return res.json({ success: true });
    });

    app.post('/admin/collections/add', requireAuth, (req, res) => {
        const { name, slug } = req.body;
        const displayType = normalizeCollectionDisplayType(req.body.displayType || req.body.display_type);
        const result = db.prepare('INSERT INTO collections (name, slug, display_type, is_hidden) VALUES (?, ?, ?, 1)').run(name, slug, displayType);
        invalidateCachedData({ collectionSlug: slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: result.lastInsertRowid,
                    name,
                    slug,
                    display_type: displayType,
                    is_hidden: 1,
                    hide_info: 0,
                    show_credit: false,
                    access_blocked: false
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/update-type/:id', requireAuth, (req, res) => {
        const displayType = normalizeCollectionDisplayType(req.body.displayType || req.body.display_type);
        db.prepare('UPDATE collections SET display_type = ? WHERE id = ?').run(displayType, req.params.id);
        const row = db.prepare('SELECT slug, name FROM collections WHERE id = ?').get(req.params.id);
        if (row && row.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    name: row && row.name ? row.name : '',
                    slug: row && row.slug ? row.slug : '',
                    display_type: displayType
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/rename/:id', requireAuth, (req, res) => {
        const nextName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const row = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (!row || !row.slug) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: req.__('admin.collectionDetail.collectionNotExist') });
            return res.redirect('/admin');
        }
        if (!nextName) {
            if (wantsJson(req)) return res.status(400).json({ success: false, error: req.__('admin.collectionDetail.collectionNameRequired') });
            return res.redirect('/admin');
        }

        db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(nextName, req.params.id);
        invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    name: nextName,
                    slug: row.slug
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/update-report/:id', requireAuth, (req, res) => {
        const reportMarkdown = typeof (req.body || {}).report_markdown === 'string' ? req.body.report_markdown : '';
        db.prepare('UPDATE collections SET report_markdown = ? WHERE id = ?').run(reportMarkdown, req.params.id);
        const row = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    slug: row && row.slug ? row.slug : '',
                    report_markdown: reportMarkdown
                }
            });
        }
        return res.redirect(`/admin/collections/${req.params.id}`);
    });

    app.post('/admin/media/update-report/:id', requireAuth, (req, res) => {
        const reportMarkdown = typeof (req.body || {}).report_markdown === 'string' ? req.body.report_markdown : '';
        db.prepare('UPDATE media SET report_markdown = ? WHERE id = ?').run(reportMarkdown, req.params.id);
        const row = db.prepare(`
            SELECT media.collection_id AS collectionId, collections.slug AS slug
            FROM media
            JOIN collections ON collections.id = media.collection_id
            WHERE media.id = ?
        `).get(req.params.id);

        if (wantsJson(req)) {
            return res.json({
                success: true,
                media: {
                    id: Number(req.params.id),
                    collectionId: row ? row.collectionId : null,
                    report_markdown: reportMarkdown
                }
            });
        }
        return res.redirect(row ? `/admin/collections/${row.collectionId}` : '/admin');
    });

    app.post('/admin/collections/toggle-hidden/:id', requireAuth, (req, res) => {
        const shouldClearAccessBlocked = req.body && req.body.clear_access_blocked === '1';
        db.prepare(`
            UPDATE collections
            SET
                is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END,
                access_blocked = CASE
                    WHEN is_hidden = 1 AND ? = 1 THEN 0
                    ELSE access_blocked
                END
            WHERE id = ?
        `).run(shouldClearAccessBlocked ? 1 : 0, req.params.id);
        const row = db.prepare('SELECT slug, hide_info, is_hidden, show_credit, access_blocked FROM collections WHERE id = ?').get(req.params.id);
        if (row && row.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    slug: row && row.slug ? row.slug : '',
                    is_hidden: row ? !!row.is_hidden : false,
                    hide_info: row ? !!row.hide_info : false,
                    show_credit: row ? !!row.show_credit : false,
                    access_blocked: row ? !!row.access_blocked : false
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/toggle-hide-info/:id', requireAuth, (req, res) => {
        const shouldClearShowCredit = req.body && req.body.clear_show_credit === '1';
        db.prepare(`
            UPDATE collections
            SET
                hide_info = CASE WHEN hide_info = 1 THEN 0 ELSE 1 END,
                show_credit = CASE
                    WHEN hide_info = 0 THEN 0
                    WHEN ? = 1 THEN 0
                    ELSE show_credit
                END
            WHERE id = ?
        `).run(shouldClearShowCredit ? 1 : 0, req.params.id);
        const row = db.prepare('SELECT slug, hide_info, is_hidden, show_credit, access_blocked FROM collections WHERE id = ?').get(req.params.id);
        if (row && row.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    slug: row && row.slug ? row.slug : '',
                    is_hidden: row ? !!row.is_hidden : false,
                    hide_info: row ? !!row.hide_info : false,
                    show_credit: row ? !!row.show_credit : false,
                    access_blocked: row ? !!row.access_blocked : false
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/toggle-show-credit/:id', requireAuth, (req, res) => {
        const existing = db.prepare('SELECT slug, hide_info, is_hidden, show_credit, access_blocked FROM collections WHERE id = ?').get(req.params.id);
        if (!existing) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Collection not found' });
            return res.redirect('/admin');
        }

        db.prepare(`
            UPDATE collections
            SET
                show_credit = CASE WHEN show_credit = 1 THEN 0 ELSE 1 END,
                hide_info = CASE WHEN show_credit = 1 THEN hide_info ELSE 1 END
            WHERE id = ?
        `).run(req.params.id);
        const row = db.prepare('SELECT slug, hide_info, is_hidden, show_credit, access_blocked FROM collections WHERE id = ?').get(req.params.id);
        if (row && row.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    slug: row && row.slug ? row.slug : '',
                    is_hidden: row ? !!row.is_hidden : false,
                    hide_info: row ? !!row.hide_info : false,
                    show_credit: row ? !!row.show_credit : false,
                    access_blocked: row ? !!row.access_blocked : false
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/toggle-access-blocked/:id', requireAuth, (req, res) => {
        db.prepare(`
            UPDATE collections
            SET
                access_blocked = CASE WHEN access_blocked = 1 THEN 0 ELSE 1 END,
                is_hidden = CASE WHEN access_blocked = 1 THEN is_hidden ELSE 1 END
            WHERE id = ?
        `).run(req.params.id);
        const row = db.prepare('SELECT slug, hide_info, is_hidden, show_credit, access_blocked FROM collections WHERE id = ?').get(req.params.id);
        if (row && row.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: row.slug });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                collection: {
                    id: Number(req.params.id),
                    slug: row && row.slug ? row.slug : '',
                    is_hidden: row ? !!row.is_hidden : false,
                    hide_info: row ? !!row.hide_info : false,
                    show_credit: row ? !!row.show_credit : false,
                    access_blocked: row ? !!row.access_blocked : false
                }
            });
        }
        return res.redirect('/admin');
    });

    app.post('/admin/collections/delete/:id', requireAuth, (req, res) => {
        if (req.body.confirmed !== '1') return res.redirect('/admin');
        const collection = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (!collection) return res.redirect('/admin');

        const isSafePathSegment = (value) => {
            if (!value || typeof value !== 'string') return false;
            return value === path.basename(value) && !value.includes('/') && !value.includes('\\');
        };

        if (!isSafePathSegment(collection.slug)) {
            db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
            return res.redirect('/admin');
        }

        const collectionDir = path.join(contentRoot, collection.slug);
        if (fs.existsSync(collectionDir)) {
            try {
                fs.removeSync(collectionDir);
            } catch (err) {
                console.error(`Failed to delete collection directory: ${collectionDir}`, err);
            }
        }

        db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
        invalidateCachedData({ collectionId: req.params.id, collectionSlug: collection.slug });
        return res.redirect('/admin');
    });

    app.post('/admin/collections/reorder', requireAuth, (req, res) => {
        const { order } = req.body;
        const update = db.prepare('UPDATE collections SET order_index = ? WHERE id = ?');
        const transaction = db.transaction((items) => {
            items.forEach((id, index) => update.run(index, id));
        });
        transaction(order);
        invalidateCachedData();
        return res.json({ success: true });
    });

    app.get('/admin/collections/:id', requireAuth, (req, res) => {
        const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
        const media = db.prepare('SELECT * FROM media WHERE collection_id = ? ORDER BY order_index ASC').all(req.params.id);
        const blocks = db.prepare('SELECT * FROM collection_blocks WHERE collection_id = ? AND is_deleted_draft = 0 ORDER BY order_index ASC').all(req.params.id);
        const mediaItems = media.map((item) => {
            const isVideo = isVideoFile(item.filename);
            return {
                ...item,
                isVideo
            };
        });
        res.render('admin/collection_detail', { collection, media: mediaItems, blocks });
    });

    app.post('/admin/collections/:id/media/upload', requireAuth, (req, res, next) => {
        const collection = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (!collection || !collection.slug) {
            return renderUploadError(req, res, req.__('admin.collectionDetail.collectionNotExist'), 404);
        }
        req.params.collectionSlug = collection.slug;
        return next();
    }, runArrayUpload('media'), async (req, res) => {
        const insert = db.prepare('INSERT OR IGNORE INTO media (collection_id, filename, original_name, order_index, is_published) VALUES (?, ?, ?, ?, 0)');
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            return renderUploadError(req, res, req.__('admin.collectionDetail.selectMediaFiles'), 400);
        }

        const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM media WHERE collection_id = ?').get(req.params.id);
        let currentOrder = (maxOrder && maxOrder.max !== null) ? maxOrder.max + 1 : 0;
        const newMediaIds = [];
        files.forEach((file) => {
            const result = insert.run(req.params.id, file.filename, file.originalname, currentOrder++);
            if (result.lastInsertRowid) newMediaIds.push(Number(result.lastInsertRowid));
        });

        const blockId = req.body.block_id ? Number(req.body.block_id) : null;
        if (blockId && newMediaIds.length > 0) {
            const block = db.prepare('SELECT media_ids FROM collection_blocks WHERE id = ? AND collection_id = ?').get(blockId, req.params.id);
            if (block) {
                let existingIds = [];
                try { existingIds = JSON.parse(block.media_ids || '[]'); } catch (_) { existingIds = []; }
                if (!Array.isArray(existingIds)) existingIds = [];
                const mergedIds = existingIds.concat(newMediaIds);
                db.prepare('UPDATE collection_blocks SET media_ids = ? WHERE id = ?').run(JSON.stringify(mergedIds), blockId);
            }
        }

        const collectionSlug = req.params.collectionSlug;
        const isVideoProcessingReady = await ensureVideoProcessingAvailableForFiles({
            files,
            isVideoFile,
            isFfmpegAvailable: videoProcessor.isFfmpegAvailable,
            cleanupUploadedFiles: () => cleanupUploadedTempFiles({ files, unlinkSync: fs.unlinkSync })
        });
        if (!isVideoProcessingReady) {
            return renderUploadError(req, res, req.__('admin.collectionDetail.videoProcessingFailed'), 500);
        }

        const redirectUrl = `/admin/collections/${req.params.id}`;
        const job = wantsJson(req) ? createProcessingJob({
            ownerUserId: req.session.userId,
            totalSteps: calculateProcessingSteps({ files, isVideoFile, isImageFile }),
            redirectUrl
        }) : null;

        enqueueCollectionMediaPostProcessing({
            files,
            collectionSlug,
            job,
            bumpProcessingJob,
            isVideoFile,
            isImageFile,
            enqueueBackgroundVideoTask,
            enqueueBackgroundImageTask,
            processUploadedVideo: videoProcessor.processUploadedVideo,
            ensureImageVariants: ensureCollectionImageVariants,
            compressOriginalImageInPlace,
            getVideoPath: (slug, filename) => path.join(getCollectionImagesRootDir(slug), 'video', filename),
            getCollectionOutputDir: (slug) => getCollectionImagesRootDir(slug),
            getOriginalImagePath: (slug, filename) => path.join(getCollectionMediaDir(slug, 'original'), filename)
        });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                redirectUrl,
                jobId: job ? job.id : null,
                statusUrl: job ? `/admin/jobs/${job.id}` : null
            });
        }
        return res.redirect(redirectUrl);
    });

    app.post('/admin/media/delete/:id', requireAuth, (req, res) => {
        const mediaItem = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
        if (!mediaItem) return res.json({ success: true, message: 'Media already deleted' });
        const nextDeleted = mediaItem.is_deleted_draft ? 0 : 1;
        db.prepare('UPDATE media SET is_deleted_draft = ? WHERE id = ?').run(nextDeleted, req.params.id);
        return res.json({
            success: true,
            media: {
                id: Number(req.params.id),
                is_deleted_draft: !!nextDeleted
            }
        });
    });

    app.post('/admin/media/reorder', requireAuth, (req, res) => {
        const { order } = req.body;
        const update = db.prepare('UPDATE media SET order_index = ? WHERE id = ?');
        const transaction = db.transaction((items) => {
            items.forEach((id, index) => update.run(index, id));
        });
        transaction(order);
        return res.json({ success: true });
    });

    app.post('/admin/collections/:id/blocks/add', requireAuth, (req, res) => {
        const collection = db.prepare('SELECT id, slug, display_type FROM collections WHERE id = ?').get(req.params.id);
        if (!collection) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: req.__('admin.collectionDetail.collectionNotExist') });
            return res.redirect('/admin');
        }
        const blockType = (req.body.block_type === 'media') ? 'media' : 'text';
        if (blockType === 'media' && collection.display_type !== 'report') {
            if (wantsJson(req)) return res.status(400).json({ success: false, error: 'Media blocks can only be added in report mode' });
            return res.redirect(`/admin/collections/${req.params.id}`);
        }
        const maxOrder = db.prepare('SELECT MAX(order_index) AS max FROM collection_blocks WHERE collection_id = ?').get(req.params.id);
        const nextOrder = (maxOrder && maxOrder.max !== null) ? maxOrder.max + 1 : 0;
        const insertBlock = db.prepare(`
            INSERT INTO collection_blocks (collection_id, block_type, order_index, markdown, media_ids, published_markdown, published_media_ids)
            VALUES (?, ?, ?, '', '[]', '', '[]')
        `);
        const result = insertBlock.run(req.params.id, blockType, nextOrder);
        invalidateCachedData({ collectionId: collection.id, collectionSlug: collection.slug });
        if (wantsJson(req)) {
            return res.json({ success: true, block: { id: result.lastInsertRowid, block_type: blockType, order_index: nextOrder } });
        }
        return res.redirect(`/admin/collections/${req.params.id}`);
    });

    app.post('/admin/collections/:id/blocks/:blockId/update', requireAuth, (req, res) => {
        const block = db.prepare('SELECT * FROM collection_blocks WHERE id = ? AND collection_id = ?').get(req.params.blockId, req.params.id);
        if (!block) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Block not found' });
            return res.redirect('/admin');
        }
        if (block.block_type === 'text') {
            const markdown = typeof req.body.markdown === 'string' ? req.body.markdown : '';
            db.prepare('UPDATE collection_blocks SET markdown = ? WHERE id = ?').run(markdown, req.params.blockId);
        } else if (block.block_type === 'media') {
            let mediaIds = [];
            try {
                mediaIds = JSON.parse(typeof req.body.media_ids === 'string' ? req.body.media_ids : '[]');
                if (!Array.isArray(mediaIds)) mediaIds = [];
                mediaIds = mediaIds.map((id) => Number(id)).filter((id) => id > 0);
            } catch (_) { mediaIds = []; }
            db.prepare('UPDATE collection_blocks SET media_ids = ? WHERE id = ?').run(JSON.stringify(mediaIds), req.params.blockId);
        }
        const collection = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (collection && collection.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: collection.slug });
        if (wantsJson(req)) {
            const updated = db.prepare('SELECT * FROM collection_blocks WHERE id = ?').get(req.params.blockId);
            return res.json({ success: true, block: updated });
        }
        return res.redirect(`/admin/collections/${req.params.id}`);
    });

    app.post('/admin/collections/:id/blocks/:blockId/delete', requireAuth, (req, res) => {
        const block = db.prepare('SELECT * FROM collection_blocks WHERE id = ? AND collection_id = ?').get(req.params.blockId, req.params.id);
        if (!block) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Block not found' });
            return res.redirect('/admin');
        }
        db.prepare('UPDATE collection_blocks SET is_deleted_draft = 1 WHERE id = ?').run(req.params.blockId);
        const collection = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (collection && collection.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: collection.slug });
        if (wantsJson(req)) {
            return res.json({ success: true, block: { id: Number(req.params.blockId), is_deleted_draft: 1 } });
        }
        return res.redirect(`/admin/collections/${req.params.id}`);
    });

    app.post('/admin/collections/:id/blocks/reorder', requireAuth, (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'Invalid order' });
        const update = db.prepare('UPDATE collection_blocks SET order_index = ? WHERE id = ? AND collection_id = ?');
        const transaction = db.transaction((items) => {
            items.forEach((id, index) => update.run(index, id, req.params.id));
        });
        transaction(order);
        const collection = db.prepare('SELECT slug FROM collections WHERE id = ?').get(req.params.id);
        if (collection && collection.slug) invalidateCachedData({ collectionId: req.params.id, collectionSlug: collection.slug });
        return res.json({ success: true });
    });

    app.post('/admin/collections/:id/publish', requireAuth, (req, res) => {
        const collection = db.prepare('SELECT id, slug FROM collections WHERE id = ?').get(req.params.id);
        if (!collection) {
            if (wantsJson(req)) return res.status(404).json({ success: false, error: req.__('admin.collectionDetail.collectionNotExist') });
            return res.redirect('/admin');
        }

        const draftDeletedMedia = db.prepare('SELECT id, filename, published_filename FROM media WHERE collection_id = ? AND is_deleted_draft = 1').all(collection.id);
        draftDeletedMedia.forEach((mediaItem) => {
            const candidateNames = new Set([mediaItem.filename, mediaItem.published_filename].filter(Boolean));
            candidateNames.forEach((filename) => removeCollectionMediaAssets(collection.slug, filename));
        });

        const publishTransaction = db.transaction((collectionId) => {
            db.prepare('UPDATE collections SET published_report_markdown = report_markdown WHERE id = ?').run(collectionId);
            db.prepare('DELETE FROM media WHERE collection_id = ? AND is_deleted_draft = 1').run(collectionId);
            db.prepare(`
                UPDATE media
                SET
                    published_filename = filename,
                    published_original_name = original_name,
                    published_report_markdown = report_markdown,
                    published_order_index = order_index,
                    is_published = 1,
                    is_deleted_draft = 0
                WHERE collection_id = ?
            `).run(collectionId);
            db.prepare(`
                UPDATE collection_blocks
                SET
                    published_markdown = markdown,
                    published_media_ids = media_ids,
                    published_order_index = order_index,
                    is_published = 1
                WHERE collection_id = ?
            `).run(collectionId);
            db.prepare('DELETE FROM collection_blocks WHERE collection_id = ? AND is_deleted_draft = 1').run(collectionId);
        });
        publishTransaction(collection.id);
        invalidateCachedData({ collectionId: collection.id, collectionSlug: collection.slug });

        if (wantsJson(req)) {
            return res.json({ success: true });
        }
        return res.redirect(`/admin/collections/${collection.id}`);
    });

    app.get('/admin/visitors', requireAuth, (req, res) => {
        const sort = req.query.sort === 'count' ? 'count' : 'date';
        const visits = getVisitsSorted(sort, 200);
        const stats = getVisitStats();
        res.render('admin/visitors', {
            visits,
            stats,
            currentSort: sort
        });
    });

    app.get('/admin/settings', requireAuth, (req, res) => {
        const { loadSiteConfig } = require('../config');
        const config = loadSiteConfig(db);
        res.render('admin/settings', { config });
    });

    app.post('/admin/settings', requireAuth, (req, res) => {
        const { saveSiteConfig } = require('../config');
        const body = req.body || {};

        const updates = {
            siteName: (body.siteName || '').trim(),
            siteTitle: (body.siteTitle || '').trim(),
            fullSignature: (body.fullSignature || '').trim(),
            shortSignature: (body.shortSignature || '').trim(),
            icpNumber: (body.icpNumber || '').trim(),
            icpLink: (body.icpLink || '').trim(),
            imageVariantWidthThumb: parseInt(body.imageVariantWidthThumb, 10) || 400,
            imageVariantWidthMedium: parseInt(body.imageVariantWidthMedium, 10) || 1400,
            imageVariantWidthLarge: parseInt(body.imageVariantWidthLarge, 10) || 2400,
            imageVariantQuality: parseInt(body.imageVariantQuality, 10) || 82,
            imageOriginalQuality: parseInt(body.imageOriginalQuality, 10) || 90,
            videoCrf: parseInt(body.videoCrf, 10) || 23,
            videoBitrate: (body.videoBitrate || '2000k').trim(),
            videoAudioBitrate: (body.videoAudioBitrate || '128k').trim(),
            videoMaxrate: (body.videoMaxrate || '2500k').trim(),
            videoMaxResolution: (body.videoMaxResolution || '1920x1080').trim(),
            videoPreset: (body.videoPreset || 'slow').trim(),
            language: (body.language || '').trim(),
            socialLinks: []
        };

        const socialKeys = Object.keys(body).filter((k) => k.startsWith('socialLabel_'));
        socialKeys.forEach((labelKey) => {
            const idx = labelKey.replace('socialLabel_', '');
            const label = (body[labelKey] || '').trim();
            const url = (body['socialUrl_' + idx] || '').trim();
            if (label || url) {
                updates.socialLinks.push({ label, url });
            }
        });

        try {
            saveSiteConfig(db, updates);
            invalidateCachedData({ settings: true });
            if (typeof invalidateSiteConfigCache === 'function') invalidateSiteConfigCache();
            if (typeof getMediaConfig === 'function' && videoProcessor && typeof videoProcessor.updateMediaConfig === 'function') {
                videoProcessor.updateMediaConfig(getMediaConfig());
            }
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                const { loadSiteConfig } = require('../config');
                const config = loadSiteConfig(db);
                return res.json({ success: true, message: req.__('admin.settings.settingsSaved'), language: config.language || '' });
            }
            const { loadSiteConfig } = require('../config');
            const config = loadSiteConfig(db);
            res.render('admin/settings', { config, success: req.__('admin.settings.settingsSaved') });
        } catch (err) {
            console.error('Failed to save site config:', err);
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
                return res.json({ success: false, error: req.__('admin.settings.saveFailed', { message: err.message || '' }) });
            }
            const { loadSiteConfig } = require('../config');
            const config = loadSiteConfig(db);
            res.render('admin/settings', { config, error: req.__('admin.settings.saveFailed', { message: err.message || '' }) });
        }
    });

    app.get('/admin/users', requireAdmin, (req, res) => {
        res.render('admin/users');
    });

    app.get('/admin/users/api', requireAdmin, (req, res) => {
        try {
            const users = db.prepare('SELECT id, username, reset_key_hash FROM users ORDER BY id ASC').all();
            return res.json({ success: true, users: users.map(function(u) { return { id: u.id, username: u.username, has_reset_key: !!u.reset_key_hash }; }) });
        } catch (err) {
            console.error('Fetch users error:', err);
            return res.json({ success: false, error: req.__('admin.users.loadFailed') });
        }
    });

    app.post('/admin/users', requireAdmin, (req, res) => {
        const { username, password, confirmPassword } = req.body || {};
        if (!username || !password || !confirmPassword) {
            return res.json({ success: false, error: req.__('admin.users.allFieldsRequired') });
        }
        if (password !== confirmPassword) {
            return res.json({ success: false, error: req.__('admin.users.passwordMismatch') });
        }
        if (username.trim().length === 0) {
            return res.json({ success: false, error: req.__('admin.users.usernameEmpty') });
        }
        if (password.length < 4) {
            return res.json({ success: false, error: req.__('admin.users.passwordMinLength') });
        }
        const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
        if (existingUser) {
            return res.json({ success: false, error: req.__('admin.users.usernameExists') });
        }
        try {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(password, salt);
            db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username.trim(), hashedPassword);
            return res.json({ success: true, message: req.__('admin.users.userCreated') });
        } catch (err) {
            console.error('Create user error:', err);
            return res.json({ success: false, error: req.__('admin.users.createFailed', { message: err.message || '' }) });
        }
    });

    app.delete('/admin/users/:id', requireAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.json({ success: false, error: req.__('admin.users.userNotExist') });
        }
        if (user.username === 'admin') {
            return res.json({ success: false, error: req.__('admin.users.cannotDeleteDefaultAdmin') });
        }
        try {
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
            return res.json({ success: true, message: req.__('admin.users.userDeleted') });
        } catch (err) {
            console.error('Delete user error:', err);
            return res.json({ success: false, error: req.__('admin.users.deleteFailed', { message: err.message || '' }) });
        }
    });

    app.post('/admin/users/:id/password', requireAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const { oldPassword, newPassword, confirmPassword } = req.body || {};
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.json({ success: false, error: req.__('admin.users.allFieldsRequired') });
        }
        if (newPassword !== confirmPassword) {
            return res.json({ success: false, error: req.__('admin.users.newPasswordMismatch') });
        }
        if (newPassword.length < 4) {
            return res.json({ success: false, error: req.__('admin.users.passwordMinLength') });
        }
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.json({ success: false, error: req.__('admin.users.userNotExist') });
        }
        if (!bcrypt.compareSync(oldPassword, user.password)) {
            return res.json({ success: false, error: req.__('admin.users.oldPasswordIncorrect') });
        }
        try {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(newPassword, salt);
            db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
            return res.json({ success: true, message: req.__('admin.users.passwordChanged') });
        } catch (err) {
            console.error('Password update error:', err);
            return res.json({ success: false, error: req.__('admin.users.changeFailed', { message: err.message || '' }) });
        }
    });

    app.post('/admin/users/:id/generate-key', requireAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const { keyPlaintext, keyConfirm1, keyConfirm2 } = req.body || {};
        if (!keyPlaintext || keyPlaintext.trim().length === 0) {
            return res.json({ success: false, error: req.__('admin.users.enterKeyPlaintext') });
        }
        if (keyPlaintext !== keyConfirm1 || keyPlaintext !== keyConfirm2) {
            return res.json({ success: false, error: req.__('admin.users.keyMismatch') });
        }
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.json({ success: false, error: req.__('admin.users.userNotExist') });
        }
        if (user.reset_key_hash) {
            return res.json({ success: false, error: req.__('admin.users.keyAlreadyConfigured') });
        }
        try {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(keyPlaintext, salt);
            db.prepare('UPDATE users SET reset_key_hash = ? WHERE id = ?').run(hash, userId);
            return res.json({ success: true });
        } catch (err) {
            console.error('Key generation error:', err);
            return res.json({ success: false, error: req.__('admin.users.generateFailed', { message: err.message || '' }) });
        }
    });

    app.post('/admin/users/:id/clear-key', requireAdmin, (req, res) => {
        const userId = parseInt(req.params.id, 10);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.json({ success: false, error: req.__('admin.users.userNotExist') });
        }
        if (!user.reset_key_hash) {
            return res.json({ success: false, error: req.__('admin.users.userNoKey') });
        }
        try {
            db.prepare('UPDATE users SET reset_key_hash = NULL WHERE id = ?').run(userId);
            return res.json({ success: true });
        } catch (err) {
            console.error('Key clear error:', err);
            return res.json({ success: false, error: req.__('admin.users.clearKeyFailed', { message: err.message || '' }) });
        }
    });
};

module.exports = {
    registerAdminRoutes
};

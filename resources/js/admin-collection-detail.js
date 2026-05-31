        const MAX_UPLOAD_FILE_SIZE_BYTES = 300 * 1024 * 1024;
        const t = window.__i18n.admin;
        const _csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const _csrfToken = _csrfMeta ? _csrfMeta.content : '';
        const publishUpdatesButton = document.getElementById('publish-updates-button');
        const publishStatus = document.getElementById('publish-status');
        const draftIndicator = document.getElementById('draft-indicator');
        const pageNotice = document.getElementById('page-notice');
        const collectionRoot = document.getElementById('collection-detail-page');
        const collectionId = collectionRoot ? collectionRoot.dataset.collectionId : '';
        let noticeTimer = null;
        let isPublishingUpdates = false;

        function getAllMediaItems() {
            return Array.from(document.querySelectorAll('.media-item'));
        }

        function getGridForBlock(blockId) {
            return document.querySelector('.block-media-grid[data-block-id="' + blockId + '"]');
        }

        const showPageNotice = (message, isError = false) => {
            if (!pageNotice) return;
            pageNotice.textContent = message;
            pageNotice.classList.toggle('is-error', !!isError);
            pageNotice.style.display = 'block';
            if (noticeTimer) window.clearTimeout(noticeTimer);
            noticeTimer = window.setTimeout(() => {
                pageNotice.style.display = 'none';
            }, 2200);
        };

        const updateReportedCount = () => {
            const reportedCountEl = document.getElementById('reported-count');
            if (!reportedCountEl) return;
            const count = getAllMediaItems().filter((item) => item.dataset.hasReport === '1').length;
            reportedCountEl.textContent = String(count);
        };
        const updateUnpublishedCount = () => {
            const unpublishedCountEl = document.getElementById('unpublished-count');
            if (!unpublishedCountEl) return;
            const count = getAllMediaItems().filter((item) => {
                return item.dataset.isPublished !== '1' || getMediaUnpublishedKind(item) === 'report';
            }).length;
            unpublishedCountEl.textContent = String(count);
        };
        const getMediaReportDraftChanged = (mediaItem) => {
            if (!mediaItem) return false;
            const form = mediaItem.querySelector('.report-media-form');
            if (!form) return false;
            const textarea = form.querySelector('textarea[name="report_markdown"]');
            const currentValue = textarea ? textarea.value : '';
            const publishedValue = form.dataset.publishedValue || '';
            return currentValue !== publishedValue;
        };
        const getMediaUnpublishedKind = (mediaItem) => {
            if (!mediaItem) return '';
            if (mediaItem.dataset.isPublished !== '1') return 'media';
            if (getMediaReportDraftChanged(mediaItem)) return 'report';
            return '';
        };
        const syncMediaUnpublishedBadge = (mediaItem) => {
            if (!mediaItem) return;
            const meta = mediaItem.querySelector('.media-card-meta');
            if (!meta) return;
            const kind = getMediaUnpublishedKind(mediaItem);
            let badge = meta.querySelector('[data-role="unpublished-badge"]');
            if (!kind) {
                if (badge) badge.remove();
                return;
            }
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'badge unpublished';
                badge.setAttribute('data-role', 'unpublished-badge');
                const draftDeletedBadge = meta.querySelector('[data-role="draft-deleted-badge"]');
                if (draftDeletedBadge) meta.insertBefore(badge, draftDeletedBadge);
                else meta.appendChild(badge);
            }
            badge.textContent = kind === 'media' ? t.collectionDetail.mediaUnpublished : t.collectionDetail.reportUnpublished;
        };
        const hasPendingDraftChanges = () => {
            const reportForms = Array.from(document.querySelectorAll('.js-async-form'));
            const hasReportDraftChanges = reportForms.some((form) => {
                const textarea = form.querySelector('textarea[name="report_markdown"]');
                if (!textarea) return false;
                const currentValue = Object.prototype.hasOwnProperty.call(form.dataset, 'lastSavedValue')
                    ? form.dataset.lastSavedValue
                    : textarea.value;
                const publishedValue = form.dataset.publishedValue || '';
                return currentValue !== publishedValue;
            });
            if (hasReportDraftChanges) return true;
            const allMedia = getAllMediaItems();
            if (allMedia.some((item) => item.dataset.isPublished !== '1' || item.dataset.isDraftDeleted === '1')) return true;
            const blockCards = Array.from(document.querySelectorAll('.block-card'));
            if (blockCards.some((card) => card.dataset.isPublished !== '1')) return true;
            return false;
        };
        const updateDraftIndicator = () => {
            if (!draftIndicator) return;
            const hasPending = hasPendingDraftChanges();
            draftIndicator.textContent = hasPending ? t.collectionDetail.hasPendingChanges : t.collectionDetail.noPendingChanges;
            draftIndicator.classList.toggle('has-pending', hasPending);
        };

        document.addEventListener('draft-changed', () => {
            updateDraftIndicator();
        });

        const collapseMediaItem = (item) => {
            if (!item) return;
            item.classList.remove('is-expanded');
        };

        const expandMediaItem = (item) => {
            if (!item) return;
            const grid = item.closest('.media-grid');
            if (grid) {
                grid.querySelectorAll('.media-item').forEach((other) => {
                    if (other !== item) collapseMediaItem(other);
                });
            }
            item.classList.add('is-expanded');
        };

        const setAutosaveStatus = (form, message, state) => {
            if (!form) return;
            const statusEl = form.querySelector('[data-role="autosave-status"]');
            if (!statusEl) return;
            statusEl.textContent = message || '';
            statusEl.classList.toggle('is-saving', state === 'saving');
            statusEl.classList.toggle('is-error', state === 'error');
        };
        const setPublishStatus = (message, state) => {
            if (!publishStatus) return;
            publishStatus.textContent = message || '';
            publishStatus.classList.toggle('is-saving', state === 'saving');
            publishStatus.classList.toggle('is-error', state === 'error');
        };
        const updateDraftDeleteUI = (mediaItem, isDeleted) => {
            if (!mediaItem) return;
            mediaItem.dataset.isDraftDeleted = isDeleted ? '1' : '0';
            mediaItem.classList.toggle('is-draft-deleted', isDeleted);
            const meta = mediaItem.querySelector('.media-card-meta');
            if (meta) {
                let badge = meta.querySelector('[data-role="draft-deleted-badge"]');
                if (isDeleted && !badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge pending-delete';
                    badge.setAttribute('data-role', 'draft-deleted-badge');
                    badge.textContent = t.collectionDetail.pendingDelete;
                    meta.appendChild(badge);
                }
                if (!isDeleted && badge) badge.remove();
            }
            const deleteBtn = mediaItem.querySelector('.btn-draft-delete');
            if (deleteBtn) {
                if (isDeleted) {
                    deleteBtn.innerHTML = '<span class="draft-delete-label-restore">' + t.collectionDetail.restoreMedia + '</span>';
                } else {
                    deleteBtn.innerHTML = '<span class="draft-delete-label-delete">' + t.collectionDetail.markDelete + '</span>';
                }
            }
            updateDraftIndicator();
        };
        const toggleDraftDelete = async (mediaItem) => {
            if (!mediaItem) return false;
            const id = mediaItem.dataset.id;
            if (!id) return false;
            try {
                const response = await fetch(`/admin/media/delete/${id}`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'X-CSRF-Token': _csrfToken }
                });
                const data = await response.json();
                if (!data || !data.success || !data.media) {
                    throw new Error((data && data.error) ? data.error : t.collectionDetail.draftDeleteSaveFailed);
                }
                const isDeleted = !!(data.media && data.media.is_deleted_draft);
                updateDraftDeleteUI(mediaItem, isDeleted);
                showPageNotice(isDeleted ? t.collectionDetail.addedToPendingDelete : t.collectionDetail.removedFromPendingDelete);
                return true;
            } catch (error) {
                showPageNotice(error && error.message ? error.message : t.collectionDetail.draftDeleteSaveFailed, true);
                return false;
            }
        };

        const updateReportFormUI = (form) => {
            const mediaItem = form ? form.closest('.media-item') : null;
            if (!mediaItem) return;
            const textarea = form.querySelector('textarea[name="report_markdown"]');
            const badge = mediaItem.querySelector('[data-role="media-report-badge"]');
            const hasReport = !!(textarea && textarea.value.trim());
            mediaItem.dataset.hasReport = hasReport ? '1' : '0';
            if (badge) {
                badge.textContent = hasReport ? t.collectionDetail.reported : t.collectionDetail.noDescription;
                badge.classList.toggle('reported', hasReport);
            }
            syncMediaUnpublishedBadge(mediaItem);
            updateReportedCount();
            updateUnpublishedCount();
        };

        const saveAsyncForm = async (form, options = {}) => {
            if (!form) return false;
            const textarea = form.querySelector('textarea[name="report_markdown"]');
            if (!textarea) return false;

            const isAuto = !!options.auto;
            const submitButton = form.querySelector('button[type="submit"], button:not([type])');
            const originalText = submitButton ? (submitButton.dataset.originalText || submitButton.textContent) : '';
            if (submitButton && !submitButton.dataset.originalText) {
                submitButton.dataset.originalText = submitButton.textContent;
            }

            const currentValue = textarea.value;
            const initialValue = Object.prototype.hasOwnProperty.call(form.dataset, 'lastSavedValue')
                ? form.dataset.lastSavedValue
                : currentValue;

            if (form.dataset.isSaving === '1') {
                form.dataset.pendingSave = '1';
                return false;
            }

            if (currentValue === initialValue) {
                if (isAuto) setAutosaveStatus(form, t.collectionDetail.draftSaved, 'saved');
                updateDraftIndicator();
                return true;
            }

            form.dataset.isSaving = '1';
            form.dataset.pendingSave = '0';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = t.collectionDetail.saving;
            }
            setAutosaveStatus(form, isAuto ? t.collectionDetail.autoSavingDraft : '', 'saving');

            try {
                let requestUrl = form.action || '';
                requestUrl += requestUrl.indexOf('?') === -1 ? '?json=1' : '&json=1';
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-Token': _csrfToken
                    },
                    body: new URLSearchParams(new FormData(form)).toString()
                });
                const responseText = await response.text();
                let payload = null;
                try {
                    payload = responseText ? JSON.parse(responseText) : null;
                } catch (_) {}
                const treatAsSuccess = response.ok && (!responseText || !payload || payload.success);
                if (!treatAsSuccess) {
                    throw new Error(payload && payload.error ? payload.error : t.collectionDetail.saveFailed);
                }

                form.dataset.lastSavedValue = currentValue;
                updateReportFormUI(form);
                updateDraftIndicator();
                setAutosaveStatus(form, t.collectionDetail.draftAutoSaved, 'saved');
                if (!isAuto) showPageNotice(t.collectionDetail.textSaved);
            } catch (error) {
                const message = error && error.message ? error.message : t.collectionDetail.draftSaveFailed;
                setAutosaveStatus(form, isAuto ? t.collectionDetail.draftAutoSaveFailed : message, 'error');
                showPageNotice(message, true);
                return false;
            } finally {
                form.dataset.isSaving = '0';
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalText;
                }
                if (form.dataset.pendingSave === '1') {
                    window.setTimeout(() => {
                        saveAsyncForm(form, { auto: true });
                    }, 0);
                }
            }
        };

        const publishUpdates = async () => {
            if (isPublishingUpdates) return false;
            isPublishingUpdates = true;
            if (publishUpdatesButton) {
                publishUpdatesButton.disabled = true;
                publishUpdatesButton.textContent = t.collectionDetail.publishing;
            }
            setPublishStatus(t.collectionDetail.publishingToFrontend, 'saving');
            try {
                const response = await fetch(`/admin/collections/${collectionId}/publish?json=1`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-Token': _csrfToken
                    }
                });
                const data = await response.json();
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && data.error) ? data.error : t.collectionDetail.publishFailed);
                }
                document.querySelectorAll('.js-async-form').forEach((form) => {
                    form.dataset.publishedValue = form.dataset.lastSavedValue || '';
                });
                const allMedia = getAllMediaItems();
                const draftDeletedItems = allMedia.filter((item) => item.dataset.isDraftDeleted === '1');
                draftDeletedItems.forEach((item) => { item.remove(); });
                allMedia.forEach((item) => {
                    item.dataset.isPublished = '1';
                    item.dataset.isDraftDeleted = '0';
                    item.classList.remove('is-draft-deleted');
                    const badge = item.querySelector('[data-role="draft-deleted-badge"]');
                    if (badge) badge.remove();
                    syncMediaUnpublishedBadge(item);
                });
                updateUnpublishedCount();
                updateDraftIndicator();
                setPublishStatus(t.collectionDetail.publishSuccess, 'saved');
                showPageNotice(t.collectionDetail.publishSuccess);
            } catch (error) {
                const message = error && error.message ? error.message : t.collectionDetail.publishFailed;
                setPublishStatus(message, 'error');
                showPageNotice(message, true);
            } finally {
                isPublishingUpdates = false;
                if (publishUpdatesButton) {
                    publishUpdatesButton.disabled = false;
                    publishUpdatesButton.textContent = t.collectionDetail.publishUpdates;
                }
            }
        };

        const pollJob = (statusUrl, redirectUrl) => {
            if (!statusUrl) {
                window.location.href = redirectUrl || window.location.href;
                return;
            }
            const processingProgress = document.getElementById('processing-progress');
            const processingProgressBar = processingProgress ? processingProgress.querySelector('.block-upload-progress-bar, #processing-progress-bar') : null;
            const processingProgressText = processingProgress ? processingProgress.querySelector('.block-upload-progress-text, #processing-progress-text') : null;

            let stopped = false;
            const tick = () => {
                if (stopped) return;
                fetch(statusUrl, { headers: { 'Accept': 'application/json' } })
                    .then((res) => res.json())
                    .then((data) => {
                        if (!data || !data.success || !data.job) {
                            stopped = true;
                            window.location.href = redirectUrl || window.location.href;
                            return;
                        }
                        const job = data.job;
                        const total = Number(job.totalSteps || 0);
                        const done = Number(job.doneSteps || 0);
                        const failed = Number(job.failedSteps || 0);
                        const finished = done + failed;
                        const stepLabel = job.currentStepLabel || '';
                        const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(finished * 100 / total))) : 100;
                        if (processingProgressBar && processingProgressText) {
                            processingProgressBar.style.width = percent + '%';
                            if (stepLabel) {
                                processingProgressText.textContent = stepLabel;
                            } else if (failed > 0) {
                                processingProgressText.textContent = t.collectionDetail.processingWithFailures.replace('{{done}}', finished).replace('{{total}}', total).replace('{{failed}}', failed);
                            } else {
                                processingProgressText.textContent = t.collectionDetail.processing.replace('{{done}}', finished).replace('{{total}}', total);
                            }
                        }
                        if (job.status === 'completed' || (total > 0 && finished >= total)) {
                            stopped = true;
                            window.location.href = job.redirectUrl || redirectUrl || window.location.href;
                            return;
                        }
                        setTimeout(tick, 600);
                    })
                    .catch(() => setTimeout(tick, 900));
            };
            setTimeout(tick, 500);
        };

        document.querySelectorAll('.media-item').forEach((item) => {
            const expandButton = item.querySelector('.expand-media-btn');
            if (!expandButton) return;
            expandButton.addEventListener('click', () => {
                if (item.classList.contains('is-expanded')) {
                    collapseMediaItem(item);
                    return;
                }
                expandMediaItem(item);
            });
        });

        document.querySelectorAll('.js-async-form').forEach((form) => {
            const textarea = form.querySelector('textarea[name="report_markdown"]');
            if (textarea) {
                form.dataset.lastSavedValue = textarea.value;
                form.dataset.pendingSave = '0';
                form.dataset.isSaving = '0';
                let autosaveTimer = null;
                const scheduleAutosave = () => {
                    if (autosaveTimer) window.clearTimeout(autosaveTimer);
                    const changed = textarea.value !== (form.dataset.lastSavedValue || '');
                    setAutosaveStatus(form, changed ? t.collectionDetail.detectingChange : t.collectionDetail.draftSaved, changed ? 'saving' : 'saved');
                    const mediaItem = form.closest('.media-item');
                    if (mediaItem) {
                        syncMediaUnpublishedBadge(mediaItem);
                        updateUnpublishedCount();
                    }
                    updateDraftIndicator();
                    if (!changed) return;
                    autosaveTimer = window.setTimeout(() => {
                        saveAsyncForm(form, { auto: true });
                    }, 900);
                };
                textarea.addEventListener('input', scheduleAutosave);
                textarea.addEventListener('change', scheduleAutosave);
                textarea.addEventListener('blur', () => {
                    if (autosaveTimer) {
                        window.clearTimeout(autosaveTimer);
                        autosaveTimer = null;
                    }
                    if (textarea.value !== (form.dataset.lastSavedValue || '')) {
                        saveAsyncForm(form, { auto: true });
                    }
                });
            }
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveAsyncForm(form, { auto: false });
            });
        });

        getAllMediaItems().forEach(syncMediaUnpublishedBadge);
        updateUnpublishedCount();
        updateDraftIndicator();

        document.querySelectorAll('.block-media-grid').forEach((grid) => {
            let draggingElement = null;

            grid.addEventListener('dragstart', (e) => {
                if (e.target.closest('textarea') || e.target.closest('button') || e.target.closest('form')) {
                    e.preventDefault();
                    return;
                }
                const item = e.target.closest('.media-item');
                if (item) {
                    draggingElement = item;
                    setTimeout(() => {
                        item.classList.add('dragging');
                    }, 0);
                }
            });

            grid.addEventListener('dragend', (e) => {
                const item = e.target.closest('.media-item');
                if (item) {
                    item.classList.remove('dragging');
                    grid.querySelectorAll('.media-item').forEach(el => el.classList.remove('dragging'));
                    draggingElement = null;
                    updateDraftIndicator();
                }
            });

            grid.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!draggingElement) return;
                const target = e.target.closest('.media-item');
                if (target && target !== draggingElement) {
                    const rect = target.getBoundingClientRect();
                    const isAfter = (e.clientX - rect.left) > (rect.width / 2);
                    if (isAfter) {
                        grid.insertBefore(draggingElement, target.nextSibling);
                    } else {
                        grid.insertBefore(draggingElement, target);
                    }
                }
            });

            grid.addEventListener('click', (e) => {
                const draftDeleteBtn = e.target.closest('.btn-draft-delete');
                if (draftDeleteBtn) {
                    const item = draftDeleteBtn.closest('.media-item');
                    if (item) toggleDraftDelete(item);
                    return;
                }
                const item = e.target.closest('.media-item');
                if (!item) return;
                if (e.target.closest('textarea') || e.target.closest('button') || e.target.closest('form')) return;
                if (item.classList.contains('is-draft-deleted')) {
                    e.preventDefault();
                    toggleDraftDelete(item);
                }
            });
        });

        if (publishUpdatesButton) {
            publishUpdatesButton.addEventListener('click', () => {
                publishUpdates();
            });
        }

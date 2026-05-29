        const MAX_UPLOAD_FILE_SIZE_BYTES = 300 * 1024 * 1024;
        const t = window.__i18n.admin;
        const _csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const _csrfToken = _csrfMeta ? _csrfMeta.content : '';
        const mediaUploadForm = document.getElementById('media-upload-form');
        const mediaUploadInput = document.getElementById('media-upload-input');
        const grid = document.getElementById('media-grid');
        const uploadProgress = document.getElementById('upload-progress');
        const uploadProgressBar = document.getElementById('upload-progress-bar');
        const uploadProgressText = document.getElementById('upload-progress-text');
        const processingProgress = document.getElementById('processing-progress');
        const processingProgressBar = document.getElementById('processing-progress-bar');
        const processingProgressText = document.getElementById('processing-progress-text');
        const mediaSearchInput = document.getElementById('media-search');
        const mediaTypeFilter = document.getElementById('media-type-filter');
        const mediaReportFilter = document.getElementById('media-report-filter');
        const clearMediaFiltersButton = document.getElementById('clear-media-filters');
        const mediaResultsCount = document.getElementById('media-results-count');
        const mediaDeleteCount = document.getElementById('media-delete-count');
        const mediaEmptyState = document.getElementById('media-empty-state');
        const reportedCountEl = document.getElementById('reported-count');
        const unpublishedCountEl = document.getElementById('unpublished-count');
        const saveMediaOrderButton = document.getElementById('save-media-order');
        const toggleManageModeButton = document.getElementById('toggle-manage-mode');
        const mediaOrderStatus = document.getElementById('media-order-status');
        const publishUpdatesButton = document.getElementById('publish-updates-button');
        const publishStatus = document.getElementById('publish-status');
        const draftIndicator = document.getElementById('draft-indicator');
        const pageNotice = document.getElementById('page-notice');
        const collectionRoot = document.getElementById('collection-detail-page');
        const collectionId = collectionRoot ? collectionRoot.dataset.collectionId : '';
        const mediaItems = grid ? Array.from(grid.querySelectorAll('.media-item')) : [];
        let draggingElement = null;
        let noticeTimer = null;
        let isMediaOrderSaving = false;
        let pendingMediaOrderSave = false;
        let isPublishingUpdates = false;
        let isManageMode = false;
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

        const hasActiveMediaFilter = () => !!(
            (mediaSearchInput && mediaSearchInput.value.trim()) ||
            (mediaTypeFilter && mediaTypeFilter.value) ||
            (mediaReportFilter && mediaReportFilter.value)
        );

        const updateDeleteSummary = () => {
            if (!mediaDeleteCount) return;
            const deleteCount = mediaItems.filter((item) => item.dataset.isDraftDeleted === '1').length;
            mediaDeleteCount.textContent = t.collectionDetail.pendingDeleteCount.replace('{{count}}', deleteCount);
        };
        const setManageMode = (enabled) => {
            isManageMode = !!enabled;
            if (grid) grid.classList.toggle('is-manage-mode', isManageMode);
            if (toggleManageModeButton) {
                toggleManageModeButton.textContent = isManageMode ? t.collectionDetail.exitManage : t.collectionDetail.manageMedia;
            }
            showPageNotice(isManageMode ? t.collectionDetail.enteredManageMode : t.collectionDetail.exitedManageMode);
        };

        const updateReportedCount = () => {
            if (!reportedCountEl) return;
            const count = mediaItems.filter((item) => item.dataset.hasReport === '1').length;
            reportedCountEl.textContent = String(count);
        };
        const updateUnpublishedCount = () => {
            if (!unpublishedCountEl) return;
            const count = mediaItems.filter((item) => {
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
        const getPublishedOrderIds = () => mediaItems
            .slice()
            .sort((a, b) => {
                const orderA = Number(a.dataset.publishedOrderIndex || 0);
                const orderB = Number(b.dataset.publishedOrderIndex || 0);
                if (orderA !== orderB) return orderA - orderB;
                return Number(a.dataset.id || 0) - Number(b.dataset.id || 0);
            })
            .map((item) => item.dataset.id);
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
            if (mediaItems.some((item) => item.dataset.isPublished !== '1' || item.dataset.isDraftDeleted === '1')) return true;
            return getMediaOrderIds().join(',') !== getPublishedOrderIds().join(',');
        };
        const updateDraftIndicator = () => {
            if (!draftIndicator) return;
            const hasPending = hasPendingDraftChanges();
            draftIndicator.textContent = hasPending ? t.collectionDetail.hasPendingChanges : t.collectionDetail.noPendingChanges;
            draftIndicator.classList.toggle('has-pending', hasPending);
        };

        const collapseMediaItem = (item) => {
            if (!item) return;
            item.classList.remove('is-expanded');
        };

        const expandMediaItem = (item) => {
            if (!item) return;
            mediaItems.forEach((other) => {
                if (other !== item) collapseMediaItem(other);
            });
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
        const setMediaOrderStatus = (message, state) => {
            if (!mediaOrderStatus) return;
            mediaOrderStatus.textContent = message || '';
            mediaOrderStatus.classList.toggle('is-saving', state === 'saving');
            mediaOrderStatus.classList.toggle('is-error', state === 'error');
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
            updateDeleteSummary();
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
                updateMediaFilters();
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
        const getMediaOrderIds = () => [...grid.querySelectorAll('.media-item')].map(item => item.dataset.id);
        let lastSavedMediaOrder = getMediaOrderIds().join(',');
        const saveMediaOrder = async (options = {}) => {
            if (!grid) return false;
            const isAuto = !!options.auto;
            if (hasActiveMediaFilter()) {
                if (!isAuto) {
                    alert(t.collectionDetail.clearFiltersBeforeSaveOrder);
                }
                return false;
            }
            const ids = getMediaOrderIds();
            const serializedOrder = ids.join(',');
            if (serializedOrder === lastSavedMediaOrder) {
                if (isAuto) setMediaOrderStatus(t.collectionDetail.orderSaved, 'saved');
                return true;
            }
            if (isMediaOrderSaving) {
                pendingMediaOrderSave = true;
                return false;
            }

            isMediaOrderSaving = true;
            pendingMediaOrderSave = false;
            if (saveMediaOrderButton) {
                saveMediaOrderButton.disabled = true;
                saveMediaOrderButton.textContent = t.collectionDetail.saving;
            }
            setMediaOrderStatus(isAuto ? t.collectionDetail.detectingOrderChange : '', 'saving');
            try {
                const response = await fetch('/admin/media/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
                    body: JSON.stringify({ order: ids })
                });
                const data = await response.json();
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && data.error) ? data.error : t.collectionDetail.draftOrderSaveFailed);
                }
                lastSavedMediaOrder = serializedOrder;
                updateDraftIndicator();
                setMediaOrderStatus(isAuto ? t.collectionDetail.orderAutoSaved : t.collectionDetail.orderSaved, 'saved');
                if (!isAuto) showPageNotice(t.collectionDetail.orderSaved);
                return true;
            } catch (error) {
                const message = error && error.message ? error.message : t.collectionDetail.draftOrderSaveFailed;
                setMediaOrderStatus(isAuto ? t.collectionDetail.draftOrderAutoSaveFailed : message, 'error');
                showPageNotice(message, true);
                return false;
            } finally {
                isMediaOrderSaving = false;
                if (saveMediaOrderButton) {
                    saveMediaOrderButton.disabled = false;
                    saveMediaOrderButton.textContent = t.collectionDetail.saveOrder;
                }
                if (pendingMediaOrderSave) {
                    window.setTimeout(() => {
                        saveMediaOrder({ auto: true });
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

        const updateMediaFilters = () => {
            const keyword = ((mediaSearchInput && mediaSearchInput.value) || '').trim().toLowerCase();
            const kind = (mediaTypeFilter && mediaTypeFilter.value) || '';
            const reportState = (mediaReportFilter && mediaReportFilter.value) || '';
            let visibleCount = 0;

            mediaItems.forEach((item) => {
                const name = item.dataset.name || '';
                const itemKind = item.dataset.kind || '';
                const hasReport = item.dataset.hasReport === '1';
                const matchesKeyword = !keyword || name.includes(keyword);
                const matchesKind = !kind || itemKind === kind;
                const matchesReport = !reportState
                    || (reportState === 'reported' && hasReport)
                    || (reportState === 'empty' && !hasReport);
                const visible = matchesKeyword && matchesKind && matchesReport;
                item.style.display = visible ? '' : 'none';
                if (!visible) collapseMediaItem(item);
                if (visible) visibleCount += 1;
            });

            if (mediaResultsCount) {
                mediaResultsCount.textContent = t.collectionDetail.showingCount.replace('{{shown}}', visibleCount).replace('{{total}}', mediaItems.length);
            }
            if (mediaEmptyState) {
                mediaEmptyState.style.display = visibleCount === 0 ? 'block' : 'none';
            }
        };

        const pollJob = (statusUrl, redirectUrl) => {
            if (!statusUrl) {
                window.location.href = redirectUrl || window.location.href;
                return;
            }
            if (processingProgress && processingProgressBar && processingProgressText) {
                processingProgress.style.display = 'block';
                processingProgressBar.style.width = '0%';
                processingProgressText.textContent = t.collectionDetail.waitingProcessing;
            }

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

        if (mediaUploadForm && mediaUploadInput) {
            mediaUploadForm.addEventListener('submit', (e) => {
                const files = Array.from(mediaUploadInput.files || []);
                const hasLargeFile = files.some(file => file.size > MAX_UPLOAD_FILE_SIZE_BYTES);
                if (hasLargeFile) {
                    e.preventDefault();
                    alert(t.collectionDetail.uploadFailedSize);
                    return;
                }

                if (window.FormData && window.XMLHttpRequest) {
                    e.preventDefault();
                    const formData = new FormData(mediaUploadForm);
                    const xhr = new XMLHttpRequest();
                    let url = mediaUploadForm.action || '';
                    url += url.indexOf('?') === -1 ? '?json=1' : '&json=1';

                    if (uploadProgress && uploadProgressBar && uploadProgressText) {
                        uploadProgress.style.display = 'block';
                        uploadProgressBar.style.width = '0%';
                        uploadProgressText.textContent = t.collectionDetail.preparingUpload;
                    }

                    xhr.upload.onprogress = (ev) => {
                        if (!ev.lengthComputable || !uploadProgressBar || !uploadProgressText) return;
                        const percent = Math.max(0, Math.min(100, Math.round(ev.loaded * 100 / ev.total)));
                        uploadProgressBar.style.width = percent + '%';
                        uploadProgressText.textContent = t.collectionDetail.uploading.replace('{{percent}}', percent);
                    };

                    xhr.onreadystatechange = () => {
                        if (xhr.readyState !== 4) return;
                        let payload = null;
                        const contentType = (xhr.getResponseHeader('Content-Type') || '').toLowerCase();
                        try {
                            payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
                        } catch (_) {}

                        if (xhr.status >= 200 && xhr.status < 300 && payload && payload.success) {
                            if (uploadProgressBar && uploadProgressText) {
                                uploadProgressBar.style.width = '100%';
                                uploadProgressText.textContent = t.collectionDetail.uploadComplete;
                            }
                            pollJob(payload.statusUrl, payload.redirectUrl || window.location.href);
                            return;
                        }

                        if (xhr.status >= 200 && xhr.status < 300) {
                            if (xhr.responseURL && xhr.responseURL !== window.location.href) {
                                window.location.href = xhr.responseURL;
                                return;
                            }
                            if (contentType.includes('text/html')) {
                                window.location.reload();
                                return;
                            }
                        }

                        if (uploadProgress && uploadProgressBar && uploadProgressText) {
                            uploadProgressBar.style.width = '0%';
                            uploadProgressText.textContent = t.collectionDetail.uploadFailed;
                        }
                        const msg = payload && payload.error ? payload.error : t.collectionDetail.uploadFailedStatus.replace('{{status}}', xhr.status);
                        alert(msg);
                    };

                    xhr.onerror = () => {
                        if (uploadProgress && uploadProgressBar && uploadProgressText) {
                            uploadProgressBar.style.width = '0%';
                            uploadProgressText.textContent = t.collectionDetail.uploadFailed;
                        }
                        alert(t.collectionDetail.uploadNetworkError);
                    };

                    xhr.open('POST', url, true);
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                    xhr.setRequestHeader('X-CSRF-Token', _csrfToken);
                    xhr.send(formData);
                }
            });
        }

        if (mediaSearchInput) mediaSearchInput.addEventListener('input', updateMediaFilters);
        if (mediaTypeFilter) mediaTypeFilter.addEventListener('change', updateMediaFilters);
        if (mediaReportFilter) mediaReportFilter.addEventListener('change', updateMediaFilters);
        if (clearMediaFiltersButton) {
            clearMediaFiltersButton.addEventListener('click', () => {
                if (mediaSearchInput) mediaSearchInput.value = '';
                if (mediaTypeFilter) mediaTypeFilter.value = '';
                if (mediaReportFilter) mediaReportFilter.value = '';
                updateMediaFilters();
            });
        }

        mediaItems.forEach((item) => {
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

        updateMediaFilters();
        updateDeleteSummary();
        mediaItems.forEach(syncMediaUnpublishedBadge);
        updateUnpublishedCount();
        updateDraftIndicator();

        grid.addEventListener('dragstart', (e) => {
            if (isManageMode || e.target.closest('textarea') || e.target.closest('button') || e.target.closest('form')) {
                e.preventDefault();
                return;
            }
            if (hasActiveMediaFilter()) {
                e.preventDefault();
                alert(t.collectionDetail.clearFiltersBeforeDrag);
                return;
            }
            const item = e.target.closest('.media-item');
            if (item) {
                draggingElement = item;
                setTimeout(() => {
                    item.classList.add('dragging');
                    grid.classList.add('is-dragging');
                }, 0);
            }
        });

        grid.addEventListener('dragend', (e) => {
            const item = e.target.closest('.media-item');
            if (item) {
                item.classList.remove('dragging');
                grid.classList.remove('is-dragging');
                draggingElement = null;
                grid.querySelectorAll('.media-item').forEach(el => el.classList.remove('dragging'));
                const currentOrder = getMediaOrderIds().join(',');
                updateDraftIndicator();
                if (currentOrder !== lastSavedMediaOrder) {
                    saveMediaOrder({ auto: true });
                }
            }
        });

        grid.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggingElement) return;

            const target = e.target.closest('.media-item');
            if (target && target !== draggingElement) {
                const rect = target.getBoundingClientRect();
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                
                const isAfter = (mouseX - rect.left) > (rect.width / 2);
                
                if (isAfter) {
                    grid.insertBefore(draggingElement, target.nextSibling);
                } else {
                    grid.insertBefore(draggingElement, target);
                }
            }
        });

        grid.addEventListener('click', (e) => {
            if (!isManageMode) return;
            const item = e.target.closest('.media-item');
            if (!item) return;
            if (e.target.closest('textarea') || e.target.closest('button') || e.target.closest('form')) return;
            e.preventDefault();
            toggleDraftDelete(item);
        });

        if (saveMediaOrderButton) {
            saveMediaOrderButton.addEventListener('click', () => {
                saveMediaOrder({ auto: false });
            });
        }
        if (toggleManageModeButton) {
            toggleManageModeButton.addEventListener('click', () => {
                setManageMode(!isManageMode);
            });
        }
        if (publishUpdatesButton) {
            publishUpdatesButton.addEventListener('click', () => {
                publishUpdates();
            });
        }

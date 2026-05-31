        const MAX_UPLOAD_FILE_SIZE_BYTES = 300 * 1024 * 1024;
        const t = window.__i18n.admin;
        const _csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const _csrfToken = _csrfMeta ? _csrfMeta.content : '';
        const indexImageForm = document.getElementById('index-image-form');
        const indexImageInput = document.getElementById('index-image-input');
        const indexImageConfirmed = document.getElementById('index-image-confirmed');
        const indexDisplayTypeSelect = document.getElementById('index-display-type');
        const indexUploadPreview = document.getElementById('index-upload-preview');
        const indexUploadProgress = document.getElementById('index-upload-progress');
        const indexUploadProgressBar = document.getElementById('index-upload-progress-bar');
        const indexUploadProgressText = document.getElementById('index-upload-progress-text');
        const indexProcessingProgress = document.getElementById('index-processing-progress');
        const indexProcessingProgressBar = document.getElementById('index-processing-progress-bar');
        const indexProcessingProgressText = document.getElementById('index-processing-progress-text');
        const indexCurrentThumbs = document.getElementById('index-current-thumbs');
        const displayTypeSelect = document.getElementById('display-type-select');
        const displayTypeHidden = document.getElementById('display-type-hidden');
        const collectionSearchInput = document.getElementById('collection-search');
        const collectionTypeFilter = document.getElementById('collection-type-filter');
        const collectionStatusFilter = document.getElementById('collection-status-filter');
        const clearCollectionFiltersButton = document.getElementById('clear-collection-filters');
        const collectionResultsCount = document.getElementById('collection-results-count');
        const collectionEmptyState = document.getElementById('collection-empty-state');
        const hiddenEntryCountEl = document.getElementById('hidden-entry-count');
        const hiddenInfoCountEl = document.getElementById('hidden-info-count');
        const unpublishedUpdateCountEl = document.getElementById('unpublished-update-count');
        const saveOrderButton = document.getElementById('save-order');
        const collectionOrderStatus = document.getElementById('collection-order-status');
        const pageNotice = document.getElementById('page-notice');
        let isIndexImageSubmitting = false;
        let noticeTimer = null;
        let isCollectionOrderSaving = false;
        let pendingCollectionOrderSave = false;
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
        const getDisplayTypeLabel = (type) => {
            if (type === 'diptych') return t.displayType.diptych;
            if (type === 'wall') return t.displayType.wall;
            if (type === 'report') return t.displayType.report;
            return t.displayType.single;
        };
        const renderCollectionStatuses = (card) => {
            const statuses = card.querySelector('[data-role="collection-statuses"]');
            if (!statuses) return;
            const hiddenEntry = card.dataset.hiddenEntry === '1';
            const hiddenInfo = card.dataset.hiddenInfo === '1';
            const showCredit = card.dataset.showCredit === '1';
            const accessBlocked = card.dataset.accessBlocked === '1';
            const hasPendingChanges = card.dataset.hasPendingChanges === '1';
            const parts = [];
            if (hasPendingChanges) parts.push('<span class="badge has-pending-changes">' + t.collectionCard.unpublishedUpdate + '</span>');
            if (hiddenEntry) parts.push('<span class="badge hidden-entry">' + t.collectionCard.hiddenEntry + '</span>');
            if (hiddenInfo) parts.push('<span class="badge hidden-info">' + t.collectionCard.hiddenInfo + '</span>');
            if (hiddenInfo && !showCredit) parts.push('<span class="badge hidden-credit">' + t.collectionCard.hiddenCredit + '</span>');
            if (accessBlocked) parts.push('<span class="badge access-blocked">' + t.collectionCard.accessBlocked + '</span>');
            statuses.innerHTML = parts.join('');
        };
        const updateDashboardCounts = () => {
            const hiddenEntryCount = collectionCards.filter((card) => card.dataset.hiddenEntry === '1').length;
            const hiddenInfoCount = collectionCards.filter((card) => card.dataset.hiddenInfo === '1').length;
            const unpublishedUpdateCount = collectionCards.filter((card) => card.dataset.hasPendingChanges === '1').length;
            if (hiddenEntryCountEl) hiddenEntryCountEl.textContent = String(hiddenEntryCount);
            if (hiddenInfoCountEl) hiddenInfoCountEl.textContent = String(hiddenInfoCount);
            if (unpublishedUpdateCountEl) unpublishedUpdateCountEl.textContent = String(unpublishedUpdateCount);
        };
        const setCollectionOrderStatus = (message, state) => {
            if (!collectionOrderStatus) return;
            collectionOrderStatus.textContent = message || '';
            collectionOrderStatus.classList.toggle('is-saving', state === 'saving');
            collectionOrderStatus.classList.toggle('is-error', state === 'error');
        };
        const syncCollectionCreditButton = (card) => {
            if (!card) return;
            const showCredit = card.dataset.showCredit === '1';
            const button = card.querySelector('[data-role="toggle-show-credit-button"]');
            if (!button) return;
            button.title = showCredit ? t.dashboard.hideCreditHint : t.dashboard.showCreditHint;
            button.textContent = showCredit ? t.collectionCard.hideCredit : t.collectionCard.showCredit;
        };
        const syncCollectionAccessButton = (card) => {
            if (!card) return;
            const accessBlocked = card.dataset.accessBlocked === '1';
            const button = card.querySelector('[data-role="toggle-access-blocked-button"]');
            if (!button) return;
            button.textContent = accessBlocked ? t.collectionCard.allowAccess : t.collectionCard.blockAccess;
            button.title = accessBlocked ? t.dashboard.allowAccessHint : t.dashboard.blockAccessHint;
        };
        const updateCollectionCardUI = (card, collection) => {
            if (!card || !collection) return;
            if (typeof collection.name === 'string') {
                const title = card.querySelector('[data-role="collection-title"]');
                if (title) title.textContent = collection.name;
                const nameInput = card.querySelector('form[data-async-kind="rename"] input[name="name"]');
                if (nameInput) nameInput.value = collection.name;
            }
            if (typeof collection.display_type === 'string') {
                card.dataset.type = collection.display_type;
                const typeLabel = card.querySelector('[data-role="collection-type-label"]');
                if (typeLabel) typeLabel.textContent = t.dashboard.typeLabel + collection.display_type;
                const typeSelect = card.querySelector('form[data-async-kind="update-type"] select[name="display_type"]');
                if (typeSelect) typeSelect.value = collection.display_type;
            }
            if (typeof collection.is_hidden === 'boolean') {
                card.dataset.hiddenEntry = collection.is_hidden ? '1' : '0';
                const button = card.querySelector('[data-role="toggle-hidden-button"]');
                if (button) button.textContent = collection.is_hidden ? t.collectionCard.showEntry : t.collectionCard.hideEntry;
            }
            if (typeof collection.access_blocked === 'boolean') {
                card.dataset.accessBlocked = collection.access_blocked ? '1' : '0';
            }
            if (typeof collection.hide_info === 'boolean') {
                card.dataset.hiddenInfo = collection.hide_info ? '1' : '0';
                const button = card.querySelector('[data-role="toggle-hide-info-button"]');
                if (button) button.textContent = collection.hide_info ? t.collectionCard.showInfo : t.collectionCard.hideInfo;
            }
            if (typeof collection.show_credit === 'boolean') {
                card.dataset.showCredit = collection.show_credit ? '1' : '0';
            }
            syncCollectionAccessButton(card);
            syncCollectionCreditButton(card);
            renderCollectionStatuses(card);
            updateDashboardCounts();
            updateCollectionFilters();
        };
        const buildFallbackCollectionPatch = (card, asyncKind) => {
            if (!card || !asyncKind) return null;
            if (asyncKind === 'toggle-show-credit') {
                const nextShowCredit = card.dataset.showCredit !== '1';
                return {
                    show_credit: nextShowCredit,
                    hide_info: nextShowCredit ? true : undefined
                };
            }
            if (asyncKind === 'toggle-hide-info') {
                const nextHiddenInfo = card.dataset.hiddenInfo !== '1';
                const form = card.querySelector('form[data-async-kind="toggle-hide-info"]');
                const clearShowCreditInput = form ? form.querySelector('input[name="clear_show_credit"]') : null;
                const shouldClearShowCredit = !!(clearShowCreditInput && clearShowCreditInput.value === '1');
                return {
                    hide_info: nextHiddenInfo,
                    show_credit: nextHiddenInfo ? false : (shouldClearShowCredit ? false : undefined)
                };
            }
            if (asyncKind === 'toggle-hidden') {
                const form = card.querySelector('form[data-async-kind="toggle-hidden"]');
                const clearAccessBlockedInput = form ? form.querySelector('input[name="clear_access_blocked"]') : null;
                const shouldClearAccessBlocked = !!(clearAccessBlockedInput && clearAccessBlockedInput.value === '1');
                return {
                    is_hidden: card.dataset.hiddenEntry !== '1',
                    access_blocked: shouldClearAccessBlocked ? false : undefined
                };
            }
            if (asyncKind === 'toggle-access-blocked') {
                const nextAccessBlocked = card.dataset.accessBlocked !== '1';
                return {
                    access_blocked: nextAccessBlocked,
                    is_hidden: nextAccessBlocked ? true : undefined
                };
            }
            return null;
        };
        if (displayTypeSelect && displayTypeHidden) {
            const sync = () => { displayTypeHidden.value = displayTypeSelect.value; };
            displayTypeSelect.addEventListener('change', sync);
            sync();
        }
        if (indexImageForm) {
            indexImageForm.addEventListener('submit', (e) => {
                if (isIndexImageSubmitting) return;
                e.preventDefault();
                if (!indexImageInput || !indexImageInput.files || indexImageInput.files.length === 0) return;
                const files = Array.from(indexImageInput.files || []);
                if (files.some((f) => f.size > MAX_UPLOAD_FILE_SIZE_BYTES)) {
                    alert(t.dashboard.uploadFailedSize);
                    return;
                }
                const displayType = (indexDisplayTypeSelect && indexDisplayTypeSelect.value === 'diptych') ? 'diptych' : ((indexDisplayTypeSelect && indexDisplayTypeSelect.value === 'video') ? 'video' : 'single');
                if (displayType === 'diptych' && files.length !== 2) {
                    alert(t.dashboard.uploadTwoImages);
                    return;
                }
                if (displayType === 'video' && files.length !== 1) {
                    alert(t.dashboard.uploadOneVideo);
                    return;
                }
                if (displayType === 'single' && files.length !== 1) {
                    alert(t.dashboard.uploadOneImage);
                    return;
                }
                if (displayType === 'video') {
                    const isVideo = files[0] && typeof files[0].type === 'string' && files[0].type.startsWith('video/');
                    if (!isVideo) {
                        alert(t.dashboard.indexVideoOnly);
                        return;
                    }
                } else {
                    const allImages = files.every((f) => f && typeof f.type === 'string' && f.type.startsWith('image/'));
                    if (!allImages) {
                        alert(t.dashboard.uploadImageOnly);
                        return;
                    }
                }
                if (!confirm(t.dashboard.confirmChangeIndexImage)) return;
                if (indexImageConfirmed) indexImageConfirmed.value = '1';
                if (!(window.FormData && window.XMLHttpRequest)) {
                    isIndexImageSubmitting = true;
                    indexImageForm.submit();
                    return;
                }

                const pollJob = (statusUrl, redirectUrl) => {
                    if (!statusUrl) {
                        window.location.href = redirectUrl || window.location.href;
                        return;
                    }
                    if (indexProcessingProgress && indexProcessingProgressBar && indexProcessingProgressText) {
                        indexProcessingProgress.style.display = 'block';
                        indexProcessingProgressBar.style.width = '0%';
                        indexProcessingProgressText.textContent = t.dashboard.waitingProcessing;
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
                                if (indexProcessingProgressBar && indexProcessingProgressText) {
                                    indexProcessingProgressBar.style.width = percent + '%';
                                    if (stepLabel) {
                                        indexProcessingProgressText.textContent = stepLabel;
                                    } else if (failed > 0) {
                                        indexProcessingProgressText.textContent = t.dashboard.processingWithFailures.replace('{{done}}', finished).replace('{{total}}', total).replace('{{failed}}', failed);
                                    } else {
                                        indexProcessingProgressText.textContent = t.dashboard.processing.replace('{{done}}', finished).replace('{{total}}', total);
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

                const formData = new FormData(indexImageForm);
                const xhr = new XMLHttpRequest();
                let url = indexImageForm.action || '';
                url += url.indexOf('?') === -1 ? '?json=1' : '&json=1';

                if (indexUploadProgress && indexUploadProgressBar && indexUploadProgressText) {
                    indexUploadProgress.style.display = 'block';
                    indexUploadProgressBar.style.width = '0%';
                    indexUploadProgressText.textContent = t.dashboard.preparingUpload;
                }

                isIndexImageSubmitting = true;

                xhr.upload.onprogress = (ev) => {
                    if (!ev.lengthComputable || !indexUploadProgressBar || !indexUploadProgressText) return;
                    const percent = Math.max(0, Math.min(100, Math.round(ev.loaded * 100 / ev.total)));
                    indexUploadProgressBar.style.width = percent + '%';
                    indexUploadProgressText.textContent = t.dashboard.uploading.replace('{{percent}}', percent);
                };

                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;
                    isIndexImageSubmitting = false;
                    let payload = null;
                    try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}

                    if (xhr.status >= 200 && xhr.status < 300 && payload && payload.success) {
                        if (indexUploadProgressBar && indexUploadProgressText) {
                            indexUploadProgressBar.style.width = '100%';
                            indexUploadProgressText.textContent = t.dashboard.uploadComplete;
                        }
                        pollJob(payload.statusUrl, payload.redirectUrl || window.location.href);
                        return;
                    }

                    if (indexUploadProgressBar && indexUploadProgressText) {
                        indexUploadProgressBar.style.width = '0%';
                        indexUploadProgressText.textContent = t.dashboard.uploadFailed;
                    }
                    const msg = payload && payload.error ? payload.error : t.dashboard.uploadFailedStatus.replace('{{status}}', xhr.status);
                    alert(msg);
                };

                xhr.onerror = () => {
                    isIndexImageSubmitting = false;
                    if (indexUploadProgressBar && indexUploadProgressText) {
                        indexUploadProgressBar.style.width = '0%';
                        indexUploadProgressText.textContent = t.dashboard.uploadFailed;
                    }
                    alert(t.dashboard.uploadNetworkError);
                };

                xhr.open('POST', url, true);
                xhr.setRequestHeader('X-CSRF-Token', _csrfToken);
                xhr.send(formData);
            });
        }

        const renderIndexPreview = () => {
            if (!indexUploadPreview || !indexImageInput || !indexImageInput.files) return;
            indexUploadPreview.innerHTML = '';
            const files = Array.from(indexImageInput.files || []);
            const displayType = (indexDisplayTypeSelect && indexDisplayTypeSelect.value === 'diptych') ? 'diptych' : ((indexDisplayTypeSelect && indexDisplayTypeSelect.value === 'video') ? 'video' : 'single');
            const previewFiles = displayType === 'diptych' ? files.slice(0, 2) : files.slice(0, 1);
            previewFiles.forEach((file) => {
                const url = URL.createObjectURL(file);
                if (displayType === 'video') {
                    const video = document.createElement('video');
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = true;
                    video.playsInline = true;
                    video.preload = 'metadata';
                    video.style.width = '120px';
                    video.style.height = 'auto';
                    video.style.display = 'block';
                    video.style.background = '#000';
                    const source = document.createElement('source');
                    source.src = url;
                    video.appendChild(source);
                    video.onloadeddata = () => { try { URL.revokeObjectURL(url); } catch (_) {} };
                    indexUploadPreview.appendChild(video);
                    return;
                }

                const img = document.createElement('img');
                img.style.width = '120px';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.background = '#000';
                img.src = url;
                img.onload = () => { try { URL.revokeObjectURL(url); } catch (_) {} };
                indexUploadPreview.appendChild(img);
            });
        };

        if (indexImageInput) {
            indexImageInput.addEventListener('change', renderIndexPreview);
        }

        if (indexCurrentThumbs && indexCurrentThumbs.dataset.diptych === '1') {
            let draggingSlot = null;

            indexCurrentThumbs.addEventListener('dragstart', (e) => {
                const thumb = e.target.closest && e.target.closest('.index-thumb');
                if (!thumb || thumb.getAttribute('draggable') !== 'true') return;
                draggingSlot = thumb.dataset.slot || null;
                thumb.classList.add('dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', draggingSlot || '');
                }
            });

            indexCurrentThumbs.addEventListener('dragend', (e) => {
                const thumb = e.target.closest && e.target.closest('.index-thumb');
                if (thumb) thumb.classList.remove('dragging');
                draggingSlot = null;
            });

            indexCurrentThumbs.addEventListener('dragover', (e) => {
                if (!draggingSlot) return;
                e.preventDefault();
            });

            indexCurrentThumbs.addEventListener('drop', (e) => {
                if (!draggingSlot) return;
                e.preventDefault();
                const targetThumb = e.target.closest && e.target.closest('.index-thumb');
                if (!targetThumb) return;
                const targetSlot = targetThumb.dataset.slot || null;
                if (!targetSlot || targetSlot === draggingSlot) return;

                fetch('/admin/index-images/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
                    body: JSON.stringify({ swap: true })
                }).then((res) => res.json()).then((data) => {
                    if (data && data.success) {
                        const thumbs = Array.from(indexCurrentThumbs.querySelectorAll('.index-thumb'));
                        if (thumbs.length === 2) {
                            indexCurrentThumbs.insertBefore(thumbs[1], thumbs[0]);
                        }
                        showPageNotice(t.dashboard.indexImageOrderSaved);
                        return;
                    }
                    alert((data && data.error) ? data.error : t.dashboard.saveFailed);
                }).catch(() => alert(t.dashboard.saveFailed));
            });
        }

        document.querySelectorAll('.delete-collection-form').forEach((form) => {
            form.addEventListener('submit', (e) => {
                const confirmed = form.querySelector('input[name="confirmed"]');
                if (confirmed && confirmed.value === '1') return;
                e.preventDefault();
                if (!confirm(t.dashboard.confirmDeleteCollection)) return;
                if (confirmed) confirmed.value = '1';
                form.submit();
            });
        });

        const list = document.getElementById('collection-list');
        const collectionCards = list ? Array.from(list.querySelectorAll('.collection-card')) : [];
        let draggingElement = null;
        const collapseCollectionCard = (card) => {
            if (!card) return;
            card.classList.remove('is-expanded');
            const toggleButton = card.querySelector('.collection-toggle-btn');
            if (toggleButton) toggleButton.setAttribute('aria-expanded', 'false');
        };
        const expandCollectionCard = (card) => {
            if (!card) return;
            collectionCards.forEach((otherCard) => {
                if (otherCard !== card) collapseCollectionCard(otherCard);
            });
            card.classList.add('is-expanded');
            const toggleButton = card.querySelector('.collection-toggle-btn');
            if (toggleButton) toggleButton.setAttribute('aria-expanded', 'true');
        };

        const updateCollectionFilters = () => {
            if (!collectionCards.length) return;
            const keyword = ((collectionSearchInput && collectionSearchInput.value) || '').trim().toLowerCase();
            const selectedType = (collectionTypeFilter && collectionTypeFilter.value) || '';
            const selectedStatus = (collectionStatusFilter && collectionStatusFilter.value) || '';
            let visibleCount = 0;

            collectionCards.forEach((card) => {
                const name = card.dataset.name || '';
                const slug = card.dataset.slug || '';
                const type = card.dataset.type || '';
                const hiddenEntry = card.dataset.hiddenEntry === '1';
                const hiddenInfo = card.dataset.hiddenInfo === '1';
                const hasPendingChanges = card.dataset.hasPendingChanges === '1';

                const matchesKeyword = !keyword || name.includes(keyword) || slug.includes(keyword);
                const matchesType = !selectedType || type === selectedType;
                const matchesStatus = (() => {
                    if (!selectedStatus) return true;
                    if (selectedStatus === 'entry-visible') return !hiddenEntry;
                    if (selectedStatus === 'entry-hidden') return hiddenEntry;
                    if (selectedStatus === 'info-hidden') return hiddenInfo;
                    if (selectedStatus === 'has-pending') return hasPendingChanges;
                    if (selectedStatus === 'any-hidden') return hiddenEntry || hiddenInfo;
                    return true;
                })();

                const visible = matchesKeyword && matchesType && matchesStatus;
                card.style.display = visible ? '' : 'none';
                if (!visible) collapseCollectionCard(card);
                if (visible) visibleCount += 1;
            });

            if (collectionResultsCount) {
                collectionResultsCount.textContent = t.dashboard.showingCount.replace('{{shown}}', visibleCount).replace('{{total}}', collectionCards.length);
            }
            if (collectionEmptyState) {
                collectionEmptyState.style.display = visibleCount === 0 ? 'block' : 'none';
            }
        };

        if (collectionSearchInput) collectionSearchInput.addEventListener('input', updateCollectionFilters);
        if (collectionTypeFilter) collectionTypeFilter.addEventListener('change', updateCollectionFilters);
        if (collectionStatusFilter) collectionStatusFilter.addEventListener('change', updateCollectionFilters);
        if (clearCollectionFiltersButton) {
            clearCollectionFiltersButton.addEventListener('click', () => {
                if (collectionSearchInput) collectionSearchInput.value = '';
                if (collectionTypeFilter) collectionTypeFilter.value = '';
                if (collectionStatusFilter) collectionStatusFilter.value = '';
                updateCollectionFilters();
            });
        }
        updateCollectionFilters();

        collectionCards.forEach((card) => {
            syncCollectionAccessButton(card);
            syncCollectionCreditButton(card);
            const toggleButton = card.querySelector('.collection-toggle-btn');
            if (!toggleButton) return;
            toggleButton.addEventListener('click', () => {
                const expanded = card.classList.contains('is-expanded');
                if (expanded) {
                    collapseCollectionCard(card);
                    return;
                }
                expandCollectionCard(card);
            });
        });

        document.addEventListener('submit', async (e) => {
            const form = e.target && e.target.closest ? e.target.closest('.js-async-form') : null;
            if (!form) return;
            e.preventDefault();
            const card = form.closest('.collection-card');
            if (form.dataset.asyncKind === 'toggle-show-credit' && card && card.dataset.hiddenInfo !== '1') {
                const willEnableShowCredit = card.dataset.showCredit !== '1';
                if (willEnableShowCredit) {
                    const confirmed = window.confirm(t.dashboard.confirmEnableCreditNeedsHideInfo);
                    if (!confirmed) return;
                }
            }
            if (form.dataset.asyncKind === 'toggle-access-blocked' && card) {
                const willEnableAccessBlocked = card.dataset.accessBlocked !== '1';
                const isHiddenEntry = card.dataset.hiddenEntry === '1';
                if (willEnableAccessBlocked && !isHiddenEntry) {
                    const confirmed = window.confirm(t.dashboard.confirmEnableAccessBlockedNeedsHideEntry);
                    if (!confirmed) return;
                }
            }
            if (form.dataset.asyncKind === 'toggle-hidden' && card) {
                let clearAccessBlockedInput = form.querySelector('input[name="clear_access_blocked"]');
                if (!clearAccessBlockedInput) {
                    clearAccessBlockedInput = document.createElement('input');
                    clearAccessBlockedInput.type = 'hidden';
                    clearAccessBlockedInput.name = 'clear_access_blocked';
                    form.appendChild(clearAccessBlockedInput);
                }
                clearAccessBlockedInput.value = '0';
                const willShowEntry = card.dataset.hiddenEntry === '1';
                const isAccessBlocked = card.dataset.accessBlocked === '1';
                if (willShowEntry && isAccessBlocked) {
                    const shouldClearAccessBlocked = window.confirm(t.dashboard.confirmShowEntryWithAccessBlocked);
                    if (!shouldClearAccessBlocked) return;
                    clearAccessBlockedInput.value = shouldClearAccessBlocked ? '1' : '0';
                }
            }
            if (form.dataset.asyncKind === 'toggle-hide-info' && card) {
                let clearShowCreditInput = form.querySelector('input[name="clear_show_credit"]');
                if (!clearShowCreditInput) {
                    clearShowCreditInput = document.createElement('input');
                    clearShowCreditInput.type = 'hidden';
                    clearShowCreditInput.name = 'clear_show_credit';
                    form.appendChild(clearShowCreditInput);
                }
                clearShowCreditInput.value = '0';
                const willShowInfo = card.dataset.hiddenInfo === '1';
                const isShowCredit = card.dataset.showCredit === '1';
                if (willShowInfo && isShowCredit) {
                    const shouldClearShowCredit = window.confirm(t.dashboard.confirmShowInfoWithShowCredit);
                    if (!shouldClearShowCredit) return;
                    clearShowCreditInput.value = shouldClearShowCredit ? '1' : '0';
                }
            }
            const submitButton = form.querySelector('button[type="submit"], button:not([type])');
            const originalText = submitButton ? submitButton.textContent : '';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = t.dashboard.saving;
            }
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
                    throw new Error(payload && payload.error ? payload.error : t.dashboard.saveFailed);
                }
                if (payload && payload.collection) {
                    updateCollectionCardUI(card, payload.collection);
                } else {
                    const fallbackPatch = buildFallbackCollectionPatch(card, form.dataset.asyncKind);
                    if (fallbackPatch) updateCollectionCardUI(card, fallbackPatch);
                }
                showPageNotice(t.dashboard.saved);
                if (
                    submitButton &&
                    form.dataset.asyncKind !== 'toggle-hidden' &&
                    form.dataset.asyncKind !== 'toggle-hide-info' &&
                    form.dataset.asyncKind !== 'toggle-show-credit' &&
                    form.dataset.asyncKind !== 'toggle-access-blocked'
                ) {
                    submitButton.textContent = originalText;
                }
            } catch (error) {
                showPageNotice(error && error.message ? error.message : t.dashboard.saveFailed, true);
                if (submitButton) submitButton.textContent = originalText;
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                }
            }
        });

        const hasActiveCollectionFilter = () => !!(
            (collectionSearchInput && collectionSearchInput.value.trim()) ||
            (collectionTypeFilter && collectionTypeFilter.value) ||
            (collectionStatusFilter && collectionStatusFilter.value)
        );
        const getCollectionOrderIds = () => [...list.querySelectorAll('.item')].map(item => item.dataset.id);
        let lastSavedCollectionOrder = getCollectionOrderIds().join(',');
        const saveCollectionOrder = async (options = {}) => {
            if (!list) return false;
            const isAuto = !!options.auto;
            if (hasActiveCollectionFilter()) {
                if (!isAuto) {
                    alert(t.dashboard.clearFiltersBeforeSaveOrder);
                }
                return false;
            }
            const ids = getCollectionOrderIds();
            const serializedOrder = ids.join(',');
            if (serializedOrder === lastSavedCollectionOrder) {
                if (isAuto) setCollectionOrderStatus(t.dashboard.orderSaved, 'saved');
                return true;
            }
            if (isCollectionOrderSaving) {
                pendingCollectionOrderSave = true;
                return false;
            }

            isCollectionOrderSaving = true;
            pendingCollectionOrderSave = false;
            if (saveOrderButton) {
                saveOrderButton.disabled = true;
                saveOrderButton.textContent = t.dashboard.saving;
            }
            setCollectionOrderStatus(isAuto ? t.dashboard.detectingOrderChange : '', 'saving');
            try {
                const response = await fetch('/admin/collections/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
                    body: JSON.stringify({ order: ids })
                });
                const data = await response.json();
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && data.error) ? data.error : t.dashboard.orderSaveFailed);
                }
                lastSavedCollectionOrder = serializedOrder;
                setCollectionOrderStatus(isAuto ? t.dashboard.orderAutoSaved : t.dashboard.orderSaved, 'saved');
                if (!isAuto) showPageNotice(t.dashboard.orderSaved);
                return true;
            } catch (error) {
                const message = error && error.message ? error.message : t.dashboard.orderSaveFailed;
                setCollectionOrderStatus(isAuto ? t.dashboard.autoSaveFailed : message, 'error');
                showPageNotice(message, true);
                return false;
            } finally {
                isCollectionOrderSaving = false;
                if (saveOrderButton) {
                    saveOrderButton.disabled = false;
                    saveOrderButton.textContent = t.dashboard.saveOrder;
                }
                if (pendingCollectionOrderSave) {
                    window.setTimeout(() => {
                        saveCollectionOrder({ auto: true });
                    }, 0);
                }
            }
        };

        let dragStartFromHandle = false;

        list.addEventListener('mousedown', (e) => {
            dragStartFromHandle = !!e.target.closest('.collection-handle');
        });

        list.addEventListener('dragstart', (e) => {
            if (!dragStartFromHandle) {
                e.preventDefault();
                return;
            }
            if (hasActiveCollectionFilter()) {
                e.preventDefault();
                alert(t.dashboard.clearFiltersBeforeDrag);
                return;
            }
            const item = e.target.closest('.item');
            if (item) {
                draggingElement = item;
                setTimeout(() => {
                    item.classList.add('dragging');
                }, 0);
            }
        });

        list.addEventListener('dragend', (e) => {
            const item = e.target.closest('.item');
            if (item) {
                item.classList.remove('dragging');
                draggingElement = null;
                list.querySelectorAll('.item').forEach(el => el.classList.remove('dragging'));
                const currentOrder = getCollectionOrderIds().join(',');
                if (currentOrder !== lastSavedCollectionOrder) {
                    saveCollectionOrder({ auto: true });
                }
            }
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggingElement) return;

            const target = e.target.closest('.item');
            if (target && target !== draggingElement) {
                const rect = target.getBoundingClientRect();
                const isAfter = (e.clientY - rect.top) > (rect.height / 2);
                list.insertBefore(draggingElement, isAfter ? target.nextSibling : target);
            }
        });

        // 移除旧的 getDragAfterElement 函数

        if (saveOrderButton) {
            saveOrderButton.addEventListener('click', () => {
                saveCollectionOrder({ auto: false });
            });
        }

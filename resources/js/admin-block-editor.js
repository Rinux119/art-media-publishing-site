(function() {
    var collectionRoot = document.getElementById('collection-detail-page');
    if (!collectionRoot) return;

    var collectionId = collectionRoot.dataset.collectionId;
    var collectionDisplayType = collectionRoot.dataset.displayType || 'single';
    var blockList = document.getElementById('block-list');
    var addTextBtn = document.getElementById('add-text-block');
    var addMediaBtn = document.getElementById('add-media-block');

    var _csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var _csrfToken = _csrfMeta ? _csrfMeta.content : '';

    var t = window.__i18n.admin.collectionDetail;

    function showPageNotice(message, isError) {
        var pageNotice = document.getElementById('page-notice');
        if (!pageNotice) return;
        pageNotice.textContent = message;
        pageNotice.classList.toggle('is-error', !!isError);
        pageNotice.style.display = 'block';
        setTimeout(function() { pageNotice.style.display = 'none'; }, 2200);
    }

    function getBlockCards() {
        return Array.from(blockList.querySelectorAll('.block-card'));
    }

    function getBlockOrder() {
        return getBlockCards().map(function(card) { return Number(card.dataset.blockId); });
    }

    blockList.addEventListener('click', function(e) {
        var deleteBtn = e.target.closest('.btn-delete-block');
        if (deleteBtn) {
            var blockId = deleteBtn.dataset.blockId;
            if (!confirm(t.confirmDeleteBlock)) return;
            deleteBlock(blockId);
            return;
        }

        var saveTextBtn = e.target.closest('.btn-save-text-block');
        if (saveTextBtn) {
            saveTextBlock(saveTextBtn.dataset.blockId);
            return;
        }

        var saveOrderBtn = e.target.closest('.btn-save-block-order');
        if (saveOrderBtn) {
            saveBlockMediaOrder(saveOrderBtn.dataset.blockId);
            return;
        }

        var toggleBtn = e.target.closest('.btn-toggle-collapse');
        if (toggleBtn) {
            var card = toggleBtn.closest('.block-card');
            if (card) {
                card.classList.toggle('is-collapsed');
                toggleBtn.title = card.classList.contains('is-collapsed') ? (t.expandBlock || 'Expand') : (t.collapseBlock || 'Collapse');
            }
            return;
        }

        var moveUpBtn = e.target.closest('.btn-block-up');
        if (moveUpBtn) {
            moveBlock(moveUpBtn.dataset.blockId, -1);
            return;
        }

        var moveDownBtn = e.target.closest('.btn-block-down');
        if (moveDownBtn) {
            moveBlock(moveDownBtn.dataset.blockId, 1);
            return;
        }
    });

    function deleteBlock(blockId) {
        fetch('/admin/collections/' + collectionId + '/blocks/' + blockId + '/delete?json=1', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-CSRF-Token': _csrfToken }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                var card = blockList.querySelector('.block-card[data-block-id="' + blockId + '"]');
                if (card) card.remove();
                showPageNotice(t.blockDeleted);
                document.dispatchEvent(new CustomEvent('draft-changed'));
            } else {
                showPageNotice((data && data.error) || t.blockDeleteFailed, true);
            }
        })
        .catch(function() {
            showPageNotice(t.blockDeleteFailed, true);
        });
    }

    function saveTextBlock(blockId) {
        var card = blockList.querySelector('.block-card[data-block-id="' + blockId + '"]');
        if (!card) return;
        var textarea = card.querySelector('.block-text-editor textarea');
        if (!textarea) return;
        var markdown = textarea.value;
        var statusEl = card.querySelector('[data-role="block-save-status"]');

        fetch('/admin/collections/' + collectionId + '/blocks/' + blockId + '/update?json=1', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': _csrfToken
            },
            body: 'markdown=' + encodeURIComponent(markdown)
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                if (statusEl) statusEl.textContent = t.draftSaved;
                showPageNotice(t.textSaved);
                document.dispatchEvent(new CustomEvent('draft-changed'));
            } else {
                if (statusEl) statusEl.textContent = t.saveFailed;
                showPageNotice(t.saveFailed, true);
            }
        })
        .catch(function() {
            if (statusEl) statusEl.textContent = t.draftSaveFailed;
            showPageNotice(t.draftSaveFailed, true);
        });
    }

    function saveBlockMediaOrder(blockId) {
        var grid = blockList.querySelector('.block-media-grid[data-block-id="' + blockId + '"]');
        if (!grid) return;
        var items = Array.from(grid.querySelectorAll('.media-item'));
        var order = items.map(function(item) { return Number(item.dataset.id); });
        var statusEl = blockList.querySelector('.block-order-status[data-block-id="' + blockId + '"]');

        fetch('/admin/media/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
            body: JSON.stringify({ order: order })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                if (statusEl) statusEl.textContent = t.orderSaved;
                showPageNotice(t.orderSaved);
            } else {
                if (statusEl) statusEl.textContent = t.saveFailed;
                showPageNotice(t.saveFailed, true);
            }
        })
        .catch(function() {
            if (statusEl) statusEl.textContent = t.draftSaveFailed;
            showPageNotice(t.draftSaveFailed, true);
        });
    }

    function createBlockCardHtml(block) {
        var id = block.id;
        if (block.block_type === 'media') {
            return '<div class="section block-card block-card-media" data-block-id="' + id + '" data-block-type="media" data-is-published="0" draggable="true">' +
                '<div class="section-header">' +
                    '<div class="block-card-header-left">' +
                        '<span class="block-handle" title="' + t.dragToReorder + '">⠿</span>' +
                        '<div><h2>' + t.mediaManagement + '</h2><p class="section-subtitle">' + t.mediaManagementHint + '</p></div>' +
                    '</div>' +
                    '<div class="block-card-header-right">' +
                        '<button type="button" class="btn-toggle-collapse" data-block-id="' + id + '" title="' + t.collapseBlock + '">' +
                            '<span class="collapse-icon-open">▾</span><span class="collapse-label-open">' + t.collapseBlock + '</span>' +
                            '<span class="collapse-icon-closed">▸</span><span class="collapse-label-closed">' + t.expandBlock + '</span>' +
                        '</button>' +
                        '<span class="block-move-group">' +
                            '<button type="button" class="btn-block-move btn-block-up" data-block-id="' + id + '" title="' + t.moveUp + '">' + t.moveUp + '</button>' +
                            '<button type="button" class="btn-block-move btn-block-down" data-block-id="' + id + '" title="' + t.moveDown + '">' + t.moveDown + '</button>' +
                        '</span>' +
                        '<button type="button" class="btn-delete-block" data-block-id="' + id + '" title="' + t.deleteBlock + '">' + t.deleteBlock + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="block-card-body">' +
                    '<div class="panel-soft">' +
                        '<form class="block-upload-form toolbar-row" action="/admin/collections/' + collectionId + '/media/upload" method="POST" enctype="multipart/form-data" data-block-id="' + id + '">' +
                            '<input type="hidden" name="_csrf" value="' + _csrfToken + '">' +
                            '<input type="hidden" name="block_id" value="' + id + '">' +
                            '<input type="file" name="media" accept="image/*,video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.wmv,.flv" multiple required>' +
                            '<button type="submit" class="btn-primary">' + t.startUpload + '</button>' +
                        '</form>' +
                    '</div>' +
                    '<div class="block-upload-progress" style="display:none; margin-top: 0.75rem;">' +
                        '<div class="block-upload-progress-text" style="font-size:12px;color:#666;margin-bottom:4px;">' + t.preparingUpload + '</div>' +
                        '<div style="height:6px;background:#eee;border-radius:3px;overflow:hidden;">' +
                            '<div class="block-upload-progress-bar" style="width:0%;height:100%;background:#333;"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="media-grid block-media-grid" data-block-id="' + id + '"></div>' +
                    '<div class="actions-right" style="margin-top: 16px;">' +
                        '<span class="autosave-status block-order-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                        '<button type="button" class="btn-primary btn-save-block-order" data-block-id="' + id + '">' + t.saveOrder + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        return '<div class="section block-card block-card-text" data-block-id="' + id + '" data-block-type="text" data-is-published="0" draggable="true">' +
            '<div class="section-header">' +
                '<div class="block-card-header-left">' +
                    '<span class="block-handle" title="' + t.dragToReorder + '">⠿</span>' +
                    '<div><h2>' + t.artistStatement + '</h2><p class="section-subtitle">' + t.reportPlaceholder + '</p></div>' +
                '</div>' +
                '<div class="block-card-header-right">' +
                    '<button type="button" class="btn-toggle-collapse" data-block-id="' + id + '" title="' + t.collapseBlock + '">' +
                        '<span class="collapse-icon-open">▾</span><span class="collapse-label-open">' + t.collapseBlock + '</span>' +
                        '<span class="collapse-icon-closed">▸</span><span class="collapse-label-closed">' + t.expandBlock + '</span>' +
                    '</button>' +
                    '<span class="block-move-group">' +
                        '<button type="button" class="btn-block-move btn-block-up" data-block-id="' + id + '" title="' + t.moveUp + '">' + t.moveUp + '</button>' +
                        '<button type="button" class="btn-block-move btn-block-down" data-block-id="' + id + '" title="' + t.moveDown + '">' + t.moveDown + '</button>' +
                    '</span>' +
                    '<button type="button" class="btn-delete-block" data-block-id="' + id + '" title="' + t.deleteBlock + '">' + t.deleteBlock + '</button>' +
                '</div>' +
            '</div>' +
            '<div class="block-card-body">' +
                '<div class="block-text-editor">' +
                    '<textarea name="markdown" placeholder="' + t.reportPlaceholder + '"></textarea>' +
                    '<div class="block-text-actions">' +
                        '<button type="button" class="btn-primary btn-save-text-block" data-block-id="' + id + '">' + t.saveText + '</button>' +
                        '<span class="autosave-status" data-role="block-save-status"></span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function addBlock(blockType) {
        if (blockType === 'media' && collectionDisplayType !== 'report') {
            var existingMediaBlocks = blockList.querySelectorAll('.block-card-media');
            if (existingMediaBlocks.length >= 1) {
                alert(t.mediaBlockLimitReached || 'This collection type only supports one media block');
                return;
            }
        }
        fetch('/admin/collections/' + collectionId + '/blocks/add?json=1', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': _csrfToken
            },
            body: 'block_type=' + blockType
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success && data.block) {
                var temp = document.createElement('div');
                temp.innerHTML = createBlockCardHtml(data.block);
                var newCard = temp.firstElementChild;
                newCard.classList.add('is-collapsed');
                blockList.appendChild(newCard);
                updateMoveButtons();
                document.dispatchEvent(new CustomEvent('draft-changed'));
            } else {
                showPageNotice((data && data.error) || t.blockAddFailed, true);
            }
        })
        .catch(function() {
            showPageNotice(t.blockAddFailed, true);
        });
    }

    if (addTextBtn) {
        addTextBtn.addEventListener('click', function() { addBlock('text'); });
    }
    if (addMediaBtn) {
        addMediaBtn.addEventListener('click', function() { addBlock('media'); });
    }

    function moveBlock(blockId, direction) {
        var cards = getBlockCards();
        var card = blockList.querySelector('.block-card[data-block-id="' + blockId + '"]');
        if (!card) return;
        var index = cards.indexOf(card);
        var targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= cards.length) return;
        if (direction === -1) {
            blockList.insertBefore(card, cards[targetIndex]);
        } else {
            blockList.insertBefore(card, cards[targetIndex].nextSibling);
        }
        updateMoveButtons();
        saveBlockOrder();
    }

    function updateMoveButtons() {
        var cards = getBlockCards();
        cards.forEach(function(card, i) {
            var upBtn = card.querySelector('.btn-block-up');
            var downBtn = card.querySelector('.btn-block-down');
            if (upBtn) upBtn.disabled = (i === 0);
            if (downBtn) downBtn.disabled = (i === cards.length - 1);
        });
    }

    updateMoveButtons();

    var dragSrcBlock = null;
    var dragStartFromHandle = false;

    blockList.addEventListener('mousedown', function(e) {
        dragStartFromHandle = !!e.target.closest('.block-handle');
    });

    blockList.addEventListener('dragstart', function(e) {
        if (e.target.closest('.media-item')) return;
        if (!dragStartFromHandle) {
            e.preventDefault();
            return;
        }
        var card = e.target.closest('.block-card');
        if (!card) return;
        if (e.target.closest('.media-item')) return;
        dragSrcBlock = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.blockId);
    });
    blockList.addEventListener('dragend', function(e) {
        var card = e.target.closest('.block-card');
        if (card) card.classList.remove('dragging');
        dragSrcBlock = null;
        getBlockCards().forEach(function(c) { c.classList.remove('drag-over'); });
    });
    blockList.addEventListener('dragover', function(e) {
        var card = e.target.closest('.block-card');
        if (!card || !dragSrcBlock || card === dragSrcBlock) return;
        if (e.target.closest('.media-item')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        getBlockCards().forEach(function(c) { c.classList.remove('drag-over'); });
        card.classList.add('drag-over');
    });
    blockList.addEventListener('dragleave', function(e) {
        var card = e.target.closest('.block-card');
        if (card) card.classList.remove('drag-over');
    });
    blockList.addEventListener('drop', function(e) {
        var targetCard = e.target.closest('.block-card');
        if (!targetCard || !dragSrcBlock || targetCard === dragSrcBlock) return;
        if (e.target.closest('.media-item')) return;
        e.preventDefault();

        var cards = getBlockCards();
        var fromIndex = cards.indexOf(dragSrcBlock);
        var toIndex = cards.indexOf(targetCard);
        if (fromIndex < toIndex) {
            targetCard.parentNode.insertBefore(dragSrcBlock, targetCard.nextSibling);
        } else {
            targetCard.parentNode.insertBefore(dragSrcBlock, targetCard);
        }

        getBlockCards().forEach(function(c) { c.classList.remove('drag-over'); });
        saveBlockOrder();
        updateMoveButtons();
    });

    function saveBlockOrder() {
        var order = getBlockOrder();
        fetch('/admin/collections/' + collectionId + '/blocks/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': _csrfToken },
            body: JSON.stringify({ order: order })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                showPageNotice(t.orderSaved);
                document.dispatchEvent(new CustomEvent('draft-changed'));
            }
        })
        .catch(function() {});
    }

    blockList.addEventListener('submit', function(e) {
        var form = e.target.closest('.block-upload-form');
        if (!form) return;
        e.preventDefault();

        var blockId = form.dataset.blockId;
        var card = form.closest('.block-card');
        var progressEl = card ? card.querySelector('.block-upload-progress') : null;
        var progressBar = card ? card.querySelector('.block-upload-progress-bar') : null;
        var progressText = card ? card.querySelector('.block-upload-progress-text') : null;

        var formData = new FormData(form);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', form.action + (form.action.indexOf('?') === -1 ? '?json=1' : '&json=1'), true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('X-CSRF-Token', _csrfToken);

        xhr.upload.addEventListener('progress', function(evt) {
            if (evt.lengthComputable && progressEl && progressBar) {
                var pct = Math.round((evt.loaded / evt.total) * 100);
                progressBar.style.width = pct + '%';
                if (progressText) progressText.textContent = t.uploading + ' ' + pct + '%';
            }
        });

        xhr.addEventListener('load', function() {
            var resp = null;
            var contentType = (xhr.getResponseHeader('Content-Type') || '').toLowerCase();
            try {
                resp = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch (_) {}

            if (xhr.status >= 200 && xhr.status < 300 && resp && resp.success) {
                if (progressBar && progressText) {
                    progressBar.style.width = '100%';
                    progressText.textContent = t.uploadComplete || 'Upload complete';
                }
                if (resp.statusUrl) {
                    pollUploadJob(resp.statusUrl, resp.redirectUrl || window.location.href, progressEl, progressBar, progressText);
                } else {
                    setTimeout(function() { location.reload(); }, 600);
                }
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                if (xhr.responseURL && xhr.responseURL !== window.location.href) {
                    window.location.href = xhr.responseURL;
                    return;
                }
                if (contentType.indexOf('text/html') !== -1) {
                    window.location.reload();
                    return;
                }
            }

            if (progressEl) progressEl.style.display = 'none';
            var msg = (resp && resp.error) ? resp.error : (t.uploadFailed || 'Upload failed');
            showPageNotice(msg, true);
        });

        xhr.addEventListener('error', function() {
            if (progressEl) progressEl.style.display = 'none';
            showPageNotice(t.uploadFailed || 'Upload failed', true);
        });

        if (progressEl) {
            progressEl.style.display = 'block';
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = t.preparingUpload;
        }

        xhr.send(formData);
    });

    function pollUploadJob(statusUrl, redirectUrl, progressEl, progressBar, progressText) {
        var stopped = false;
        var tick = function() {
            if (stopped) return;
            fetch(statusUrl, { headers: { 'Accept': 'application/json' } })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (!data || !data.success || !data.job) {
                        stopped = true;
                        window.location.href = redirectUrl || window.location.href;
                        return;
                    }
                    var job = data.job;
                    var total = Number(job.totalSteps || 0);
                    var done = Number(job.doneSteps || 0);
                    var failed = Number(job.failedSteps || 0);
                    var finished = done + failed;
                    var stepLabel = job.currentStepLabel || '';
                    var percent = total > 0 ? Math.max(0, Math.min(100, Math.round(finished * 100 / total))) : 100;
                    if (progressBar && progressText) {
                        progressBar.style.width = percent + '%';
                        if (stepLabel) {
                            progressText.textContent = stepLabel;
                        } else {
                            progressText.textContent = t.processing || 'Processing' + ' ' + finished + '/' + total;
                        }
                    }
                    if (job.status === 'completed' || (total > 0 && finished >= total)) {
                        stopped = true;
                        window.location.href = job.redirectUrl || redirectUrl || window.location.href;
                        return;
                    }
                    setTimeout(tick, 600);
                })
                .catch(function() { setTimeout(tick, 900); });
        };
        setTimeout(tick, 500);
    }
})();

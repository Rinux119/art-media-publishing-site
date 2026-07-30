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
        pageNotice.classList.add('is-visible');
        if (pageNotice._hideTimer) clearTimeout(pageNotice._hideTimer);
        pageNotice._hideTimer = setTimeout(function() { pageNotice.classList.remove('is-visible'); }, 3500);
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

        var saveTitleBtn = e.target.closest('.btn-save-block-title');
        if (saveTitleBtn) {
            saveBlockTitle(saveTitleBtn.dataset.blockId);
            return;
        }

        var saveFormatBtn = e.target.closest('.btn-save-block-format');
        if (saveFormatBtn) {
            saveBlockMediaFormat(saveFormatBtn.dataset.blockId);
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

        if (statusEl) { statusEl.textContent = t.orderAutoSaved || t.orderSaved; statusEl.classList.add('saving'); }

        function handleRes(res) {
            if (!res.ok) return res.text().then(function(txt) { throw new Error('HTTP ' + res.status + ': ' + txt); });
            return res.json();
        }

        Promise.all([
            fetch('/admin/media/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': _csrfToken },
                body: JSON.stringify({ order: order })
            }).then(handleRes),
            fetch('/admin/collections/' + collectionId + '/blocks/' + blockId + '/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json', 'X-CSRF-Token': _csrfToken },
                body: 'media_ids=' + encodeURIComponent(JSON.stringify(order))
            }).then(handleRes)
        ])
        .then(function(results) {
            var allOk = results.every(function(data) { return data && data.success; });
            if (allOk) {
                if (statusEl) { statusEl.textContent = t.orderSaved; statusEl.classList.remove('saving'); statusEl.classList.add('saved'); }
                showPageNotice(t.orderSaved);
                document.dispatchEvent(new CustomEvent('draft-changed'));
            } else {
                if (statusEl) { statusEl.textContent = t.saveFailed; statusEl.classList.remove('saving'); statusEl.classList.add('error'); }
                showPageNotice(t.saveFailed, true);
            }
        })
        .catch(function(err) {
            console.error('[saveBlockMediaOrder]', err);
            if (statusEl) { statusEl.textContent = t.draftSaveFailed; statusEl.classList.remove('saving'); statusEl.classList.add('error'); }
            showPageNotice(t.draftSaveFailed, true);
        });
    }

    window.__saveBlockMediaOrder = saveBlockMediaOrder;

    function saveBlockTitle(blockId) {
        var card = blockList.querySelector('.block-card[data-block-id="' + blockId + '"]');
        if (!card) return;
        var input = card.querySelector('.block-title-input');
        if (!input) return;
        var title = input.value;
        var statusEl = card.querySelector('.block-title-status');

        fetch('/admin/collections/' + collectionId + '/blocks/' + blockId + '/update?json=1', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': _csrfToken
            },
            body: 'title=' + encodeURIComponent(title)
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                if (statusEl) statusEl.textContent = t.draftSaved;
                var previewEl = card.querySelector('.block-card-title-preview');
                if (previewEl) previewEl.textContent = title ? ' · ' + title : '';
                showPageNotice(t.draftSaved);
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

    function saveBlockMediaFormat(blockId) {
        var card = blockList.querySelector('.block-card[data-block-id="' + blockId + '"]');
        if (!card) return;
        var select = card.querySelector('.block-format-select');
        if (!select) return;
        var format = select.value;
        var statusEl = card.querySelector('.block-format-status');

        fetch('/admin/collections/' + collectionId + '/blocks/' + blockId + '/update?json=1', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': _csrfToken
            },
            body: 'media_format=' + encodeURIComponent(format)
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.success) {
                if (statusEl) statusEl.textContent = t.draftSaved;
                showPageNotice(t.draftSaved);
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

    function createBlockCardHtml(block) {
        var id = block.id;
        if (block.block_type === 'media') {
            var isFormatEnabled = (collectionDisplayType === 'anthology' || collectionDisplayType === 'archiving');
            var formatFieldHtml = '';
            if (isFormatEnabled) {
                var displayModeOptions = [
                    { value: 'single', label: (t.formatSingle || 'Single') },
                    { value: 'diptych', label: (t.formatDiptych || 'Diptych') },
                    { value: 'wall', label: (t.formatWall || 'Wall') },
                    { value: 'report', label: (t.formatReport || 'Report') }
                ];
                var aspectRatioOptions = [
                    { value: '3:2', label: '3:2 (135)' },
                    { value: '2:3', label: '2:3 (Half)' },
                    { value: '2.7:1', label: '2.7:1 (X-Pan)' },
                    { value: '4:3', label: '4:3 (6x4.5)' },
                    { value: '1:1', label: '1:1 (6x6)' },
                    { value: '1.16:1', label: '1.16:1 (6x7)' },
                    { value: '1.37:1', label: '1.37:1 (6x8)' },
                    { value: '2.25:1', label: '2.25:1 (6x12)' },
                    { value: '3:1', label: '3:1 (6x17)' },
                    { value: '5:4', label: '5:4 (4x5)' }
                ];
                var displayModeHtml = displayModeOptions.map(function(opt) {
                    return '<option value="' + opt.value + '">' + opt.label + '</option>';
                }).join('');
                var aspectRatioHtml = aspectRatioOptions.map(function(opt) {
                    return '<option value="' + opt.value + '"' + (opt.value === '3:2' ? ' selected' : '') + '>' + opt.label + '</option>';
                }).join('');
                formatFieldHtml = '<div class="media-config-field media-config-field-format">' +
                    '<label class="media-config-label" for="block-media-format-' + id + '">' + (t.mediaFormat || 'Format') + '</label>' +
                    '<div class="block-format-row">' +
                        '<select id="block-media-format-' + id + '" class="block-format-select" name="block_media_format" data-block-id="' + id + '">' +
                            '<optgroup label="' + (t.displayMode || 'Display Mode') + '">' + displayModeHtml + '</optgroup>' +
                            '<optgroup label="' + (t.aspectRatio || 'Aspect Ratio') + '">' + aspectRatioHtml + '</optgroup>' +
                        '</select>' +
                        '<span class="autosave-status block-format-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                    '</div>' +
                '</div>';
            } else {
                var fixedDisplayModeMap = {
                    'single': (t.formatSingle || 'Single'),
                    'diptych': (t.formatDiptych || 'Diptych'),
                    'wall': (t.formatWall || 'Wall'),
                    'report': (t.formatReport || 'Report')
                };
                var fixedLabel = fixedDisplayModeMap[collectionDisplayType] || collectionDisplayType;
                formatFieldHtml = '<div class="media-config-field media-config-field-format">' +
                    '<label class="media-config-label" for="block-media-format-' + id + '">' + (t.mediaFormat || 'Format') + '</label>' +
                    '<div class="block-format-row">' +
                        '<select id="block-media-format-' + id + '" class="block-format-select is-disabled" name="block_media_format" data-block-id="' + id + '" disabled>' +
                            '<option value="' + collectionDisplayType + '" selected>' + fixedLabel + '</option>' +
                        '</select>' +
                        '<span class="autosave-status block-format-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                    '</div>' +
                '</div>';
            }
            var titleRowHtml = '<div class="block-title-row" data-block-id="' + id + '">' +
                '<input type="text" id="block-title-' + id + '" class="block-title-input" name="block_title" value="" placeholder="' + (t.anthologyTitlePlaceholder || '') + '" maxlength="120" data-block-id="' + id + '">' +
                '<button type="button" class="btn-secondary btn-save-block-title" data-block-id="' + id + '">' + (t.saveTitle || 'Save') + '</button>' +
                '<span class="autosave-status block-title-status" data-block-id="' + id + '" aria-live="polite"></span>' +
            '</div>';
            return '<div class="section block-card block-card-media" data-block-id="' + id + '" data-block-type="media" data-is-published="0" draggable="true">' +
                '<div class="section-header">' +
                    '<div class="block-card-header-left">' +
                        '<span class="block-handle" title="' + t.dragToReorder + '">⠿</span>' +
                        '<div><h2>' + t.mediaManagement + '<span class="block-card-title-preview" data-block-id="' + id + '"></span></h2><p class="section-subtitle">' + t.mediaManagementHint + '</p></div>' +
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
                    '<div class="media-config-panel">' +
                        '<div class="media-config-row' + (formatFieldHtml ? ' is-format-enabled' : '') + '">' +
                            '<div class="media-config-field media-config-field-title">' +
                                '<label class="media-config-label" for="block-title-' + id + '">' + (t.anthologyTitle || 'Title') + '</label>' +
                                titleRowHtml +
                            '</div>' +
                            formatFieldHtml +
                        '</div>' +
                        '<div class="media-config-label">' + (t.uploadMedia || 'Upload Media') + '</div>' +
                        '<form class="block-upload-form media-upload-row" action="/admin/collections/' + collectionId + '/media/upload" method="POST" enctype="multipart/form-data" data-block-id="' + id + '">' +
                            '<div class="media-upload-controls">' +
                                '<input type="hidden" name="_csrf" value="' + _csrfToken + '">' +
                                '<input type="hidden" name="block_id" value="' + id + '">' +
                                '<label class="file-select-label">' +
                                    '<span>' + (t.selectFile || 'Select File') + '</span>' +
                                    '<input type="file" name="media" accept="image/*,video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.wmv,.flv" multiple required>' +
                                '</label>' +
                                '<span class="file-name-display" data-block-id="' + id + '"></span>' +
                                '<button type="submit" class="btn-primary">' + t.startUpload + '</button>' +
                            '</div>' +
                        '</form>' +
                        '<div class="block-upload-progress" style="display:none;">' +
                            '<div class="block-upload-progress-text">' + t.preparingUpload + '</div>' +
                            '<div class="block-upload-progress-track">' +
                                '<div class="block-upload-progress-bar" style="width:0%;"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="media-grid block-media-grid" data-block-id="' + id + '"></div>' +
                    '<div class="media-order-bar">' +
                        '<span class="media-order-hint">' + (t.orderMediaHint || t.dragToReorder) + '</span>' +
                        '<div class="media-order-actions">' +
                            '<span class="autosave-status block-order-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                            '<button type="button" class="btn-primary btn-save-block-order" data-block-id="' + id + '">' + t.saveOrder + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        return '<div class="section block-card block-card-text" data-block-id="' + id + '" data-block-type="text" data-is-published="0" draggable="true">' +
            '<div class="section-header">' +
                '<div class="block-card-header-left">' +
                    '<span class="block-handle" title="' + t.dragToReorder + '">⠿</span>' +
                    '<div><h2>' + t.artistStatement + '<span class="block-card-title-preview" data-block-id="' + id + '"></span></h2><p class="section-subtitle">' + t.reportPlaceholder + '</p></div>' +
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
                '<div class="media-config-panel">' +
                    '<div class="media-config-row is-format-enabled">' +
                        '<div class="media-config-field media-config-field-title">' +
                            '<label class="media-config-label" for="block-title-' + id + '">' + (t.documentTitle || 'Title') + '</label>' +
                            '<div class="block-title-row" data-block-id="' + id + '">' +
                                '<input type="text" id="block-title-' + id + '" class="block-title-input" name="block_title" value="" placeholder="' + (t.documentTitlePlaceholder || '') + '" maxlength="120" data-block-id="' + id + '">' +
                                '<button type="button" class="btn-secondary btn-save-block-title" data-block-id="' + id + '">' + (t.saveTitle || 'Save') + '</button>' +
                                '<span class="autosave-status block-title-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="media-config-field media-config-field-format">' +
                            '<label class="media-config-label" for="block-media-format-' + id + '">' + (t.mediaFormat || 'Format') + '</label>' +
                            '<div class="block-format-row">' +
                                '<select id="block-media-format-' + id + '" class="block-format-select is-disabled" name="block_media_format" data-block-id="' + id + '" disabled>' +
                                    '<option value="" selected>' + (t.textModeUnavailable || 'Unavailable for text mode') + '</option>' +
                                '</select>' +
                                '<span class="autosave-status block-format-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="media-config-label">' + (t.uploadToDescription || 'Upload Media') + '</div>' +
                    '<div class="media-upload-row">' +
                        '<div class="media-upload-controls">' +
                            '<button type="button" class="btn-secondary media-library-upload-btn file-select-label" data-target="block-' + id + '"><span>' + (t.selectFile || 'Select File') + '</span></button>' +
                            '<span class="file-name-display"></span>' +
                            '<span class="autosave-status block-upload-status" data-block-id="' + id + '" aria-live="polite"></span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="block-text-editor">' +
                    '<textarea name="markdown" placeholder="' + t.reportPlaceholder + '"></textarea>' +
                '</div>' +
                '<div class="media-order-bar">' +
                    '<div class="media-order-actions">' +
                        '<span class="autosave-status" data-role="block-save-status"></span>' +
                        '<button type="button" class="btn-primary btn-save-text-block" data-block-id="' + id + '">' + t.saveText + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function addBlock(blockType) {
        if (blockType === 'media' && collectionDisplayType !== 'report' && collectionDisplayType !== 'anthology' && collectionDisplayType !== 'archiving') {
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

    blockList.addEventListener('change', function(e) {
        var select = e.target.closest('.block-format-select');
        if (select) {
            saveBlockMediaFormat(select.dataset.blockId);
        }
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

    blockList.addEventListener('change', function(e) {
        var fileInput = e.target.closest('input[type="file"]');
        if (!fileInput) return;
        var form = fileInput.closest('.block-upload-form');
        if (!form) return;
        var display = form.querySelector('.file-name-display');
        if (!display) return;
        if (fileInput.files && fileInput.files.length > 0) {
            display.textContent = fileInput.files.length === 1
                ? fileInput.files[0].name
                : (t.filesSelected || '{{count}} files selected').replace('{{count}}', fileInput.files.length);
        } else {
            display.textContent = '';
        }
    });

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

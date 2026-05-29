  (function () {
    const grid = document.getElementById('wall-grid');
    const loading = document.getElementById('wall-loading');
    const rawJson = document.getElementById('wall-items-json');
    const displayType = (grid && grid.dataset.displayType) || 'single';
    const collectionSlug = (grid && grid.dataset.collectionSlug) || '';
    const items = rawJson ? JSON.parse(rawJson.textContent || '[]') : [];
    const batchSize = parseInt((loading && loading.dataset.batchSize) || '20', 10) || 20;
    let cursor = 0;

    function getLargeUrl(filename) {
      return '/' + collectionSlug + '/' + filename.replace(/\.[^/.]+$/, '') + '_large';
    }

    function drawVideoFrameToCanvas(video, canvas) {
      if (!video || !canvas) return;
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      if (!video.videoWidth || !video.videoHeight) return;

      const rect = video.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        ctx.drawImage(video, 0, 0, w, h);
      } catch (_) {}
    }

    function createMediaNode(item) {
      if (item.isVideo) {
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.loop = true;
        video.preload = 'auto';

        if (displayType === 'wall') {
          video.autoplay = true;
        }

        const src = document.createElement('source');
        src.src = item.mediaUrl;
        video.appendChild(src);

        if (displayType === 'wall') return video;

        const wrap = document.createElement('div');
        wrap.className = 'thumb-video-wrap';

        const canvas = document.createElement('canvas');
        canvas.className = 'thumb-video-canvas';

        wrap.appendChild(video);
        wrap.appendChild(canvas);
        return wrap;
      }
      const img = document.createElement('img');
      img.src = item.mediaUrl;
      img.alt = item.original_name || '';
      img.loading = 'lazy';
      return img;
    }

    function createItemNode(item) {
      if (displayType === 'wall') {
        const link = document.createElement('a');
        link.className = 'media-link wall-link';
        link.href = getLargeUrl(item.filename);
        const wrap = document.createElement('div');
        wrap.className = 'wall-item';
        wrap.appendChild(createMediaNode(item));
        link.appendChild(wrap);
        return link;
      }

      if (displayType === 'diptych') {
        return null;
      }

      const link = document.createElement('a');
      link.className = 'media-link';
      link.href = getLargeUrl(item.filename);

      const wrap = document.createElement('div');
      wrap.className = 'media-item is-thumbnail';
      wrap.appendChild(createMediaNode(item));
      link.appendChild(wrap);
      return link;
    }

    function createDiptychNode(leftItem, rightItem) {
      const first = leftItem || rightItem;
      if (!first) return null;

      const wrap = document.createElement('div');
      wrap.className = 'media-item is-thumbnail diptych-thumb';

      const leftHalf = leftItem ? document.createElement('a') : document.createElement('div');
      leftHalf.className = leftItem ? 'media-link diptych-half' : 'diptych-half';
      if (leftItem) leftHalf.href = getLargeUrl(leftItem.filename);
      if (leftItem) leftHalf.appendChild(createMediaNode(leftItem));

      const rightHalf = rightItem ? document.createElement('a') : document.createElement('div');
      rightHalf.className = rightItem ? 'media-link diptych-half' : 'diptych-half';
      if (rightItem) rightHalf.href = getLargeUrl(rightItem.filename);
      if (rightItem) rightHalf.appendChild(createMediaNode(rightItem));

      if (!leftItem || !rightItem) {
        leftHalf.style.width = '100%';
        rightHalf.style.display = 'none';
      }

      wrap.appendChild(leftHalf);
      wrap.appendChild(rightHalf);
      return wrap;
    }

    function appendBatch() {
      const appended = [];
      if (displayType === 'diptych') {
        const end = Math.min(cursor + (batchSize * 2), items.length);
        for (; cursor < end; cursor += 2) {
          const node = createDiptychNode(items[cursor], items[cursor + 1] || null);
          if (node) {
            grid.appendChild(node);
            appended.push(node);
          }
        }
        if (cursor >= items.length) {
          loading.textContent = loading.dataset.allLoadedText || 'All content loaded';
        }
        initThumbVideos(appended);
        return;
      }

      const end = Math.min(cursor + batchSize, items.length);
      for (; cursor < end; cursor += 1) {
        const node = createItemNode(items[cursor]);
        if (node) {
          grid.appendChild(node);
          appended.push(node);
        }
      }
      if (cursor >= items.length) {
        loading.textContent = loading.dataset.allLoadedText || 'All content loaded';
      }
      initThumbVideos(appended);
    }

    function initThumbVideos(roots) {
      if (displayType === 'wall') return;
      const list = Array.isArray(roots) ? roots : [];
      list.forEach((root) => {
        if (!root) return;
        const wraps = root.querySelectorAll ? root.querySelectorAll('.thumb-video-wrap') : [];
        wraps.forEach((wrap) => {
          const video = wrap.querySelector && wrap.querySelector('video');
          const canvas = wrap.querySelector && wrap.querySelector('canvas.thumb-video-canvas');
          if (!video || !canvas || video.dataset.thumbPrimed === '1') return;
          video.dataset.thumbPrimed = '1';

          const tryDraw = () => {
            requestAnimationFrame(() => drawVideoFrameToCanvas(video, canvas));
          };

          const finish = () => {
            try { video.pause(); } catch (_) {}
            video.autoplay = false;
            video.removeAttribute('autoplay');
            tryDraw();
          };

          video.autoplay = true;
          video.setAttribute('autoplay', '');

          video.addEventListener('loadeddata', tryDraw, { once: true });
          video.addEventListener('timeupdate', finish, { once: true });

          try { video.load(); } catch (_) {}
          try {
            const p = video.play();
            if (p && typeof p.then === 'function') {
              p.then(() => {}).catch(() => {});
            }
          } catch (_) {}
        });
      });
    }

    appendBatch();
    if (cursor < items.length) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          appendBatch();
          if (cursor >= items.length) observer.disconnect();
        }
      }, { rootMargin: '200px 0px' });
      observer.observe(loading);
    }

    function attachThumbHoverVideoBehavior() {
      if (displayType === 'wall') return;
      if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;

      function stopThumbVideo(video) {
        try { video.pause(); } catch (_) {}
      }

      grid.addEventListener('pointerover', (e) => {
        const link = e.target.closest && e.target.closest('a.media-link');
        if (!link || !grid.contains(link)) return;
        if (e.relatedTarget && link.contains(e.relatedTarget)) return;
        const wraps = link.querySelectorAll('.thumb-video-wrap');
        wraps.forEach((wrap) => {
          const canvas = wrap.querySelector('canvas.thumb-video-canvas');
          if (canvas) canvas.style.opacity = '0';
        });
        const videos = link.querySelectorAll('video');
        videos.forEach((video) => {
          try { video.play(); } catch (_) {}
        });
      });

      grid.addEventListener('pointerout', (e) => {
        const link = e.target.closest && e.target.closest('a.media-link');
        if (!link || !grid.contains(link)) return;
        if (e.relatedTarget && link.contains(e.relatedTarget)) return;
        const videos = link.querySelectorAll('video');
        videos.forEach(stopThumbVideo);
        const wraps = link.querySelectorAll('.thumb-video-wrap');
        wraps.forEach((wrap) => {
          const video = wrap.querySelector('video');
          const canvas = wrap.querySelector('canvas.thumb-video-canvas');
          if (video && canvas) {
            requestAnimationFrame(() => drawVideoFrameToCanvas(video, canvas));
            canvas.style.opacity = '1';
          }
        });
      });
    }

    attachThumbHoverVideoBehavior();
  })();

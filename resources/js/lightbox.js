(function () {
  var overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;

  var mediaWrap = overlay.querySelector('.lightbox-media-wrap');
  var counterEl = overlay.querySelector('.lightbox-counter');
  var reportEl = overlay.querySelector('.lightbox-report');
  var closeBtn = overlay.querySelector('.lightbox-close');
  var prevBtn = overlay.querySelector('.lightbox-prev');
  var nextBtn = overlay.querySelector('.lightbox-next');

  var rawJson = document.getElementById('wall-items-json');
  var items = rawJson ? JSON.parse(rawJson.textContent || '[]') : [];

  var gridEl = document.getElementById('wall-grid');
  var displayType = (gridEl && gridEl.dataset.displayType) || 'single';
  var isDiptych = displayType === 'diptych';

  var currentIndex = -1;
  var markedAvailable = typeof window.marked !== 'undefined' && window.marked.parse;

  function renderMarkdown(src) {
    if (!src || !src.trim()) return '';
    if (markedAvailable) return window.marked.parse(src);
    return src;
  }

  function createMediaEl(item) {
    if (item.isVideo) {
      var video = document.createElement('video');
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.preload = 'auto';
      var src = document.createElement('source');
      src.src = item.largeUrl || item.mediaUrl;
      video.appendChild(src);
      return video;
    }
    var img = document.createElement('img');
    img.src = item.largeUrl || item.mediaUrl;
    img.alt = item.original_name || '';
    return img;
  }

  function open(index) {
    if (index < 0 || index >= items.length) return;
    currentIndex = index;
    mediaWrap.innerHTML = '';

    if (isDiptych) {
      var pairIndex = Math.floor(index / 2);
      var left = items[pairIndex * 2];
      var right = items[pairIndex * 2 + 1];

      mediaWrap.classList.add('is-diptych');

      if (left) {
        var leftWrap = document.createElement('div');
        leftWrap.className = 'lightbox-diptych-half';
        leftWrap.appendChild(createMediaEl(left));
        mediaWrap.appendChild(leftWrap);
      }
      if (right) {
        var rightWrap = document.createElement('div');
        rightWrap.className = 'lightbox-diptych-half';
        rightWrap.appendChild(createMediaEl(right));
        mediaWrap.appendChild(rightWrap);
      }

      var totalPairs = Math.ceil(items.length / 2);
      counterEl.textContent = (pairIndex + 1) + ' / ' + totalPairs;

      var reportItem = items[index] || left;
      var reportHtml = renderMarkdown((reportItem && reportItem.report_markdown) || '');
      reportEl.innerHTML = reportHtml || '';
      reportEl.style.display = reportHtml ? '' : 'none';

      prevBtn.style.display = pairIndex > 0 ? '' : 'none';
      nextBtn.style.display = pairIndex < totalPairs - 1 ? '' : 'none';
    } else {
      var item = items[index];
      mediaWrap.classList.remove('is-diptych');
      mediaWrap.appendChild(createMediaEl(item));

      counterEl.textContent = (currentIndex + 1) + ' / ' + items.length;

      var reportHtml = renderMarkdown(item.report_markdown || '');
      reportEl.innerHTML = reportHtml || '';
      reportEl.style.display = reportHtml ? '' : 'none';

      prevBtn.style.display = currentIndex > 0 ? '' : 'none';
      nextBtn.style.display = currentIndex < items.length - 1 ? '' : 'none';
    }

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    var videos = mediaWrap.querySelectorAll('video');
    videos.forEach(function (v) {
      try { v.pause(); } catch (_) {}
      v.src = '';
    });
    mediaWrap.innerHTML = '';
    mediaWrap.classList.remove('is-diptych');
    currentIndex = -1;
  }

  function goPrev() {
    if (!isDiptych) {
      if (currentIndex > 0) open(currentIndex - 1);
      return;
    }
    var pairIndex = Math.floor(currentIndex / 2);
    if (pairIndex > 0) open((pairIndex - 1) * 2);
  }

  function goNext() {
    if (!isDiptych) {
      if (currentIndex < items.length - 1) open(currentIndex + 1);
      return;
    }
    var pairIndex = Math.floor(currentIndex / 2);
    var totalPairs = Math.ceil(items.length / 2);
    if (pairIndex < totalPairs - 1) open((pairIndex + 1) * 2);
  }

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target === overlay.querySelector('.lightbox-body')) {
      close();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 'ArrowRight') goNext();
  });

  function handleClick(e) {
    var link = e.target.closest('a');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var matchLarge = href.match(/^\/([^/]+)\/(.+)_large$/);
    if (!matchLarge) return;

    var baseName = matchLarge[2];

    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      var itemBase = items[i].filename.replace(/\.[^/.]+$/, '');
      if (itemBase === baseName) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;

    e.preventDefault();
    e.stopPropagation();
    open(idx);
  }

  document.addEventListener('click', handleClick);
})();

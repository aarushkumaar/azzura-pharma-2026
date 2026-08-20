/* ============================================================
   AZZURRA PHARMACONUTRITION — PRODUCT IMAGE GALLERY
   Reusable gallery component for all product detail pages.

   Usage:
     window.AzzurraGallery.init({
       images:      [...],          // Cloudinary URL strings
       productName: "Product Name", // used for alt text
       containerId: "gallery-root"  // wraps the whole gallery HTML
     });

   The container element must already exist in the DOM.
   Call after DOM is ready (DOMContentLoaded or inline at bottom).
   ============================================================ */

(function (global) {
  'use strict';

  /* ── Cloudinary URL transformer ──────────────────────────── */
  function cldUrl(url, transform) {
    if (!url) return '';
    if (url.indexOf('res.cloudinary.com') === -1) return url;
    return url.replace('/image/upload/', '/image/upload/' + transform + '/');
  }

  /* ── Inject gallery CSS once ─────────────────────────────── */
  var _cssInjected = false;
  function injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;
    var style = document.createElement('style');
    style.textContent = [
      /* ── Main container ── */
      '.az-gallery { position: relative; }',

      /* ── Main viewer ── */
      '.az-gallery__main-wrap {',
      '  position: relative;',
      '  border-radius: 20px;',
      '  overflow: hidden;',
      '  aspect-ratio: 1;',
      '  max-width: 480px;',
      '  background: #E8F1FB;',
      '  border: 1.5px solid #D1E3F8;',
      '  margin-bottom: 14px;',
      '  cursor: zoom-in;',
      '}',

      /* Placeholder (no images) */
      '.az-gallery__placeholder {',
      '  width: 100%; height: 100%;',
      '  display: flex; flex-direction: column;',
      '  align-items: center; justify-content: center;',
      '  gap: 12px; color: #1A5FA8;',
      '}',
      '.az-gallery__placeholder-logo {',
      '  font-family: inherit; font-size: 22px;',
      '  font-weight: 800; letter-spacing: 0.08em;',
      '  opacity: 0.45;',
      '}',
      '.az-gallery__placeholder-text {',
      '  font-size: 12px; opacity: 0.35; letter-spacing: 0.05em;',
      '}',

      /* Skeleton pulse */
      '@keyframes az-pulse {',
      '  0%,100% { opacity: 1; } 50% { opacity: 0.45; }',
      '}',
      '.az-gallery__skeleton {',
      '  position: absolute; inset: 0;',
      '  background: #E8F1FB;',
      '  display: flex; align-items: center; justify-content: center;',
      '  z-index: 2;',
      '  animation: az-pulse 1.2s ease-in-out infinite;',
      '  transition: opacity 0.25s;',
      '}',
      '.az-gallery__skeleton.hidden { opacity: 0; pointer-events: none; }',

      /* Main image */
      '.az-gallery__main-img {',
      '  width: 100%; height: 100%;',
      '  object-fit: cover;',
      '  display: block;',
      '  transition: opacity 0.3s ease;',
      '}',
      '.az-gallery__main-img.fading { opacity: 0; }',

      /* Arrow navigation */
      '.az-gallery__arrow {',
      '  position: absolute; top: 50%; transform: translateY(-50%);',
      '  width: 40px; height: 40px; border-radius: 50%;',
      '  background: rgba(255,255,255,0.85); border: none; cursor: pointer;',
      '  display: flex; align-items: center; justify-content: center;',
      '  color: #1A5FA8; font-size: 18px; font-weight: 700;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,0.15);',
      '  opacity: 0; transition: opacity 0.25s, background 0.2s;',
      '  z-index: 3; user-select: none;',
      '}',
      '.az-gallery__main-wrap:hover .az-gallery__arrow { opacity: 1; }',
      '.az-gallery__arrow:hover { background: rgba(255,255,255,1); }',
      '.az-gallery__arrow--prev { left: 10px; }',
      '.az-gallery__arrow--next { right: 10px; }',

      /* Counter */
      '.az-gallery__counter {',
      '  text-align: center; font-size: 13px;',
      '  color: #6B7280; margin-bottom: 14px; letter-spacing: 0.04em;',
      '}',

      /* Thumbnail strip */
      '.az-gallery__thumbs-wrap { position: relative; }',
      '.az-gallery__thumbs {',
      '  display: flex; gap: 10px;',
      '  overflow-x: auto; scroll-behavior: smooth;',
      '  padding-bottom: 6px; scrollbar-width: none;',
      '}',
      '.az-gallery__thumbs::-webkit-scrollbar { display: none; }',
      '.az-gallery__thumb {',
      '  width: 72px; height: 72px; flex-shrink: 0;',
      '  border-radius: 12px; overflow: hidden;',
      '  border: 2px solid #D1E3F8; cursor: pointer;',
      '  transition: border-color 0.2s, transform 0.2s;',
      '}',
      '.az-gallery__thumb.active { border-color: #1A5FA8; }',
      '.az-gallery__thumb:hover { transform: scale(1.06); }',
      '.az-gallery__thumb img {',
      '  width: 100%; height: 100%; object-fit: cover; display: block;',
      '}',
      /* Scroll fade on right edge */
      '.az-gallery__thumbs-fade {',
      '  position: absolute; top: 0; right: 0; bottom: 6px; width: 40px;',
      '  background: linear-gradient(to right, transparent, rgba(249,249,255,0.9));',
      '  pointer-events: none;',
      '}',

      /* ── Lightbox ── */
      '.az-lightbox {',
      '  position: fixed; inset: 0; z-index: 9999;',
      '  background: rgba(0,0,0,0.85);',
      '  display: flex; align-items: center; justify-content: center;',
      '  opacity: 0; pointer-events: none;',
      '  transition: opacity 0.3s ease;',
      '}',
      '.az-lightbox.open { opacity: 1; pointer-events: all; }',
      '.az-lightbox__img {',
      '  max-width: 90vw; max-height: 90vh;',
      '  object-fit: contain; border-radius: 8px;',
      '  transition: opacity 0.25s ease;',
      '}',
      '.az-lightbox__img.fading { opacity: 0; }',
      '.az-lightbox__close {',
      '  position: absolute; top: 20px; right: 24px;',
      '  background: none; border: none; color: #fff;',
      '  font-size: 36px; line-height: 1; cursor: pointer;',
      '  opacity: 0.8; transition: opacity 0.2s;',
      '}',
      '.az-lightbox__close:hover { opacity: 1; }',
      '.az-lightbox__arrow {',
      '  position: absolute; top: 50%; transform: translateY(-50%);',
      '  width: 48px; height: 48px; border-radius: 50%;',
      '  background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3);',
      '  color: #fff; font-size: 22px; cursor: pointer;',
      '  display: flex; align-items: center; justify-content: center;',
      '  transition: background 0.2s;',
      '}',
      '.az-lightbox__arrow:hover { background: rgba(255,255,255,0.3); }',
      '.az-lightbox__arrow--prev { left: 20px; }',
      '.az-lightbox__arrow--next { right: 20px; }',
      '.az-lightbox__counter {',
      '  position: absolute; bottom: 24px; left: 50%;',
      '  transform: translateX(-50%);',
      '  color: rgba(255,255,255,0.7); font-size: 14px;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ── Build gallery HTML inside container ──────────────────── */
  function buildHTML(container, images, productName) {
    var hasImages = images && images.length > 0;

    var mainContent = hasImages
      ? '<div class="az-gallery__skeleton" id="az-skeleton"><span class="az-gallery__placeholder-logo">AZZURRA</span></div>' +
        '<img class="az-gallery__main-img" id="az-main-img" src="" alt="' + productName + '" fetchpriority="high" />' +
        '<button class="az-gallery__arrow az-gallery__arrow--prev" id="az-prev" aria-label="Previous image">&#8249;</button>' +
        '<button class="az-gallery__arrow az-gallery__arrow--next" id="az-next" aria-label="Next image">&#8250;</button>'
      : '<div class="az-gallery__placeholder">' +
        '<span class="az-gallery__placeholder-logo">AZZURRA</span>' +
        '<span class="az-gallery__placeholder-text">Image coming soon</span>' +
        '</div>';

    var thumbsContent = '';
    if (hasImages && images.length > 1) {
      var thumbItems = images.map(function (url, i) {
        return '<div class="az-gallery__thumb' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" role="button" tabindex="0" aria-label="View image ' + (i + 1) + '">' +
          '<img src="' + cldUrl(url, 'f_auto,q_auto,w_150') + '" alt="' + productName + ' view ' + (i + 1) + '" loading="lazy" />' +
          '</div>';
      }).join('');
      thumbsContent = '<div class="az-gallery__thumbs-wrap">' +
        '<div class="az-gallery__thumbs" id="az-thumbs">' + thumbItems + '</div>' +
        (images.length > 5 ? '<div class="az-gallery__thumbs-fade"></div>' : '') +
        '</div>';
    }

    var counterHtml = hasImages
      ? '<p class="az-gallery__counter" id="az-counter">1 / ' + images.length + '</p>'
      : '';

    container.innerHTML =
      '<div class="az-gallery">' +
        '<div class="az-gallery__main-wrap" id="az-main-wrap">' + mainContent + '</div>' +
        counterHtml +
        thumbsContent +
      '</div>' +
      /* Lightbox — appended to body separately */
      '';

    /* Lightbox lives on body so it's truly fullscreen */
    var existingLB = document.getElementById('az-lightbox');
    if (!existingLB) {
      var lb = document.createElement('div');
      lb.id = 'az-lightbox';
      lb.className = 'az-lightbox';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Image lightbox');
      lb.innerHTML =
        '<button class="az-lightbox__close" id="az-lb-close" aria-label="Close lightbox">&#215;</button>' +
        '<button class="az-lightbox__arrow az-lightbox__arrow--prev" id="az-lb-prev" aria-label="Previous image">&#8249;</button>' +
        '<img class="az-lightbox__img" id="az-lb-img" src="" alt="' + productName + '" />' +
        '<button class="az-lightbox__arrow az-lightbox__arrow--next" id="az-lb-next" aria-label="Next image">&#8250;</button>' +
        '<p class="az-lightbox__counter" id="az-lb-counter"></p>';
      document.body.appendChild(lb);
    }
  }

  /* ── Main init function ───────────────────────────────────── */
  function init(config) {
    injectCSS();
    config = config || {};
    var rawImages = config.images || (config.product ? config.product.images : []);
    var images = [];
    if (typeof rawImages === 'string') {
      try { images = JSON.parse(rawImages || '[]'); }
      catch(_) { if (rawImages.trim().startsWith('http')) images = [rawImages.trim()]; }
    } else if (Array.isArray(rawImages)) {
      images = rawImages;
    }
    if ((!images || !images.length) && config.product) {
      if (config.product.imagePath) images = [config.product.imagePath];
      else if (config.product.image_url) images = [config.product.image_url];
    }
    if (!Array.isArray(images)) images = [];
    images = images.filter(Boolean);

    var productName = config.productName || (config.product ? config.product.name : 'Product') || 'Product';
    var containerId = config.containerId || 'az-gallery-root';

    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[AzzurraGallery] Container #' + containerId + ' not found.');
      return;
    }

    buildHTML(container, images, productName);

    if (!images.length) return; /* No images — placeholder only, done. */

    /* ── Element references ─── */
    var mainImg   = document.getElementById('az-main-img');
    var skeleton  = document.getElementById('az-skeleton');
    var prevBtn   = document.getElementById('az-prev');
    var nextBtn   = document.getElementById('az-next');
    var counterEl = document.getElementById('az-counter');
    var thumbsCt  = document.getElementById('az-thumbs');
    var mainWrap  = document.getElementById('az-main-wrap');
    var lightbox  = document.getElementById('az-lightbox');
    var lbImg     = document.getElementById('az-lb-img');
    var lbClose   = document.getElementById('az-lb-close');
    var lbPrev    = document.getElementById('az-lb-prev');
    var lbNext    = document.getElementById('az-lb-next');
    var lbCounter = document.getElementById('az-lb-counter');

    var current = 0;
    var total   = images.length;

    /* ── Go to image ─── */
    function goTo(index, skipFade) {
      index = ((index % total) + total) % total;
      current = index;

      /* Update counter */
      if (counterEl) counterEl.textContent = (index + 1) + ' / ' + total;

      /* Update active thumbnail */
      if (thumbsCt) {
        thumbsCt.querySelectorAll('.az-gallery__thumb').forEach(function (t, i) {
          t.classList.toggle('active', i === index);
        });
        /* Scroll thumb into view */
        var activeThumb = thumbsCt.children[index];
        if (activeThumb) {
          activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }

      var newSrc = cldUrl(images[index], 'f_auto,q_auto,w_800');

      if (skipFade) {
        if (skeleton) skeleton.classList.remove('hidden');
        var firstImg = new Image();
        firstImg.onload = function () {
          mainImg.src = newSrc;
          if (skeleton) skeleton.classList.add('hidden');
        };
        firstImg.onerror = function () {
          if (skeleton) skeleton.classList.add('hidden');
        };
        firstImg.src = newSrc;
        return;
      }

      /* Crossfade */
      mainImg.classList.add('fading');
      if (skeleton) skeleton.classList.remove('hidden');

      var img = new Image();
      img.onload = function () {
        mainImg.src = newSrc;
        mainImg.classList.remove('fading');
        if (skeleton) skeleton.classList.add('hidden');
      };
      img.onerror = function () {
        mainImg.classList.remove('fading');
        if (skeleton) skeleton.classList.add('hidden');
      };
      img.src = newSrc;
    }

    /* Init with first image */
    goTo(0, true);

    /* ── Arrow navigation ─── */
    if (prevBtn) prevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      goTo(current - 1);
    });
    if (nextBtn) nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      goTo(current + 1);
    });

    /* ── Thumbnail clicks ─── */
    if (thumbsCt) {
      thumbsCt.addEventListener('click', function (e) {
        var thumb = e.target.closest('.az-gallery__thumb');
        if (!thumb) return;
        var idx = parseInt(thumb.getAttribute('data-index'), 10);
        goTo(idx);
      });
      thumbsCt.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          var thumb = e.target.closest('.az-gallery__thumb');
          if (thumb) {
            e.preventDefault();
            goTo(parseInt(thumb.getAttribute('data-index'), 10));
          }
        }
      });
    }

    /* ── Touch / swipe on main image ─── */
    var touchStartX = 0;
    var touchStartY = 0;
    var SWIPE_MIN   = 50;

    mainWrap.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    mainWrap.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0) goTo(current + 1);
      else         goTo(current - 1);
    }, { passive: true });

    /* ── Click main image → open lightbox ─── */
    mainWrap.addEventListener('click', function (e) {
      if (e.target === prevBtn || e.target === nextBtn) return;
      openLightbox(current);
    });

    /* ── Lightbox ─── */
    function openLightbox(index) {
      if (!lightbox) return;
      document.body.style.overflow = 'hidden';
      lightbox.classList.add('open');
      updateLightbox(index, true);
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }

    function updateLightbox(index, skipFade) {
      index = ((index % total) + total) % total;
      current = index; /* keep main & lightbox in sync */
      if (lbCounter) lbCounter.textContent = (index + 1) + ' / ' + total;

      var src = cldUrl(images[index], 'f_auto,q_auto,w_1600');
      if (!skipFade) lbImg.classList.add('fading');

      var img = new Image();
      img.onload = function () {
        lbImg.src = src;
        lbImg.classList.remove('fading');
      };
      img.onerror = function () { lbImg.classList.remove('fading'); };
      img.src = src;

      /* Also update main gallery index */
      goTo(index);
    }

    if (lbClose)   lbClose.addEventListener('click', closeLightbox);
    if (lbPrev)    lbPrev.addEventListener('click', function () { updateLightbox(current - 1); });
    if (lbNext)    lbNext.addEventListener('click', function () { updateLightbox(current + 1); });

    /* Close on backdrop click */
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    /* Keyboard navigation */
    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape')      closeLightbox();
      if (e.key === 'ArrowLeft')   updateLightbox(current - 1);
      if (e.key === 'ArrowRight')  updateLightbox(current + 1);
    });

    /* Lightbox touch swipe */
    var lbTouchX = 0;
    lightbox.addEventListener('touchstart', function (e) {
      lbTouchX = e.changedTouches[0].clientX;
    }, { passive: true });
    lightbox.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - lbTouchX;
      if (Math.abs(dx) < SWIPE_MIN) return;
      if (dx < 0) updateLightbox(current + 1);
      else         updateLightbox(current - 1);
    }, { passive: true });
  }

  /* ── Public API ──────────────────────────────────────────── */
  global.AzzurraGallery = { init: init };

}(window));

/* ============================================================
   AZZURRA PHARMACONUTRITION — SHARED JAVASCRIPT  (main.js)
   Handles: Navbar (new canonical + legacy), mobile menu,
            cart badge, profile icon, fade-up animations,
            stat counters, contact form, active nav link.
   ============================================================ */


/* ============================================================
   1. CANONICAL NAVBAR (main-nav / #mainNav)
   Handles scroll shadow, hamburger, active link, cart badge,
   and profile icon state for all pages using the new navbar.
   ============================================================ */
function initNavbar() {
  /* Scroll shadow */
  var nav = document.getElementById('mainNav');
  if (nav) {
    window.addEventListener('scroll', function() {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }

  /* Active link based on current page path */
  var path = window.location.pathname;
  var currentFile = path.split('/').filter(Boolean).pop() || 'index.html';
  if (currentFile === 'azzura' || currentFile === '') currentFile = 'index.html';

  document.querySelectorAll('.nav-links a, .nav-mobile-menu a').forEach(function(link) {
    var href     = link.getAttribute('href') || '';
    var linkFile = href.split('/').filter(Boolean).pop() || '';

    if (linkFile && currentFile === linkFile) {
      link.classList.add('active');
    } else if ((currentFile === 'index.html' || currentFile === '') && (linkFile === 'index.html' || href === 'index.html' || href === './')) {
      link.classList.add('active');
    }
  });

  /* Hamburger toggle */
  var hamburger  = document.getElementById('navHamburger');
  var mobileMenu = document.getElementById('navMobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function() {
      var isOpen = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });
    /* Close on outside click */
    document.addEventListener('click', function(e) {
      if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
    /* Close when a drawer link is clicked */
    mobileMenu.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* Cart badge */
  updateCartBadge();

  /* Profile icon state */
  updateProfileIcon();
}

/* ============================================================
   2. CART BADGE
   Reads localStorage, updates #cartBadge (new) and
   #cart-badge (legacy) if present.
   ============================================================ */
function updateCartBadge() {
  try {
    var raw  = localStorage.getItem('azzurra_cart') || localStorage.getItem('azzurra_cart_v1') || '[]';
    var cart = JSON.parse(raw);
    if (!Array.isArray(cart)) cart = [];
    var total = cart.reduce(function(sum, item) {
      return sum + (parseInt(item.quantity || item.qty || 1, 10));
    }, 0);

    /* New canonical badge: #cartBadge */
    var badge = document.getElementById('cartBadge');
    if (badge) {
      badge.textContent = total;
      badge.classList.toggle('visible', total > 0);
    }

    /* Legacy badge: #cart-badge (old navbar HTML) */
    var legacyBadge = document.getElementById('cart-badge');
    if (legacyBadge) {
      legacyBadge.textContent = total;
      legacyBadge.style.display = total > 0 ? 'flex' : 'none';
    }

    /* Legacy badge: #navbar-cart-badge (productss.html old style) */
    var oldBadge = document.getElementById('navbar-cart-badge');
    if (oldBadge) {
      oldBadge.textContent = total;
      oldBadge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
  } catch(e) {
    console.warn('[Azzurra] Cart badge update failed:', e);
  }
}
window.updateCartBadge = updateCartBadge;

/* ============================================================
   3. PROFILE ICON STATE
   - Not logged in → link points to customer-auth.html
   - Logged in → link points to customer-dashboard.html,
     icon turns blue, title shows user email
   ============================================================ */
/* ============================================================
   3a. PROFILE ICON HELPERS
   ============================================================ */
function _setProfileLoggedIn(btn, email) {
  btn.setAttribute('href', 'customer-dashboard.html');
  btn.setAttribute('title', email || 'My Account');
  btn.style.color      = '#1A5FA8';
  btn.style.background = '#E8F1FB';
}
function _setProfileLoggedOut(btn) {
  var returnTo = encodeURIComponent(window.location.href);
  btn.setAttribute('href', 'customer-auth.html?returnTo=' + returnTo);
  btn.setAttribute('title', 'My Account');
  btn.style.color      = '';
  btn.style.background = '';
}

function updateProfileIcon() {
  var btn = document.getElementById('navProfileBtn');
  if (!btn) return;

  /* Step 1: Render immediately from localStorage (no flash / layout shift) */
  var loggedInFromCache = false;
  try {
    var raw = localStorage.getItem('azzurra_customer_session');
    if (raw) {
      var cached = JSON.parse(raw);
      if (cached && (cached.email || cached.signedIn)) {
        _setProfileLoggedIn(btn, cached.email);
        loggedInFromCache = true;
      }
    }
  } catch(e) {}

  if (!loggedInFromCache) {
    _setProfileLoggedOut(btn);
  }

  /* Step 2: Async Supabase session check to clear any stale localStorage.
     Runs after immediate paint so there is no perceptible delay. */
  if (typeof window.getCustomerSession === 'function') {
    window.getCustomerSession().then(function(session) {
      if (session && session.user) {
        var email = session.user.email || '';
        _setProfileLoggedIn(btn, email);
        if (typeof window.syncCustomerData === 'function') {
          try { window.syncCustomerData(session.user); } catch(_) {}
        }
        try { localStorage.setItem('azzurra_customer_session', JSON.stringify({ email: email, signedIn: true })); } catch(_) {}
      } else {
        try { localStorage.removeItem('azzurra_customer_session'); } catch(_) {}
        _setProfileLoggedOut(btn);
      }
    }).catch(function() { /* network error - preserve cached state */ });
  }
}
window.updateProfileIcon = updateProfileIcon;

/* ============================================================
   4. LEGACY NAVBAR SCROLL (old .navbar / #navbar pages)
   Kept for any page still using the old navbar class.
   ============================================================ */
(function initLegacyNavbar() {
  var navbar = document.querySelector('.navbar');
  if (!navbar) return;
  function onScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      if (!navbar.classList.contains('navbar--solid')) {
        navbar.classList.remove('scrolled');
      }
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}());


/* ============================================================
   5. LEGACY MOBILE HAMBURGER MENU (old #navbar-hamburger pages)
   ============================================================ */
(function initLegacyMobileMenu() {
  var hamburger = document.getElementById('navbar-hamburger');
  var drawer    = document.getElementById('navbar-drawer');
  var overlay   = document.getElementById('navbar-overlay');
  var closeBtn  = document.getElementById('drawer-close');

  if (!hamburger || !drawer) return;

  function openDrawer() {
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay)  overlay.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', closeDrawer);
  });
}());


/* ============================================================
   6. FADE-UP SCROLL ANIMATION
   ============================================================ */
(function initFadeUp() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.fade-up, .stagger').forEach(function(el) {
      el.classList.add('visible');
    });
    return;
  }

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold:   0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  document.querySelectorAll('.fade-up, .stagger').forEach(function(el) {
    observer.observe(el);
  });

  window.initFadeUp = function() {
    document.querySelectorAll('.fade-up:not(.visible), .stagger:not(.visible)').forEach(function(el) {
      observer.observe(el);
    });
  };
}());


/* ============================================================
   7. STAT COUNTER ANIMATION
   ============================================================ */
(function initCounters() {
  var counters = document.querySelectorAll('[data-count-to]');
  if (!counters.length) return;

  if (!('IntersectionObserver' in window)) {
    counters.forEach(function(el) {
      el.textContent = el.getAttribute('data-count-to') + (el.getAttribute('data-suffix') || '');
    });
    return;
  }

  var counterObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(function(el) {
    counterObserver.observe(el);
  });

  function animateCounter(el) {
    var target   = parseInt(el.getAttribute('data-count-to'), 10);
    var suffix   = el.getAttribute('data-suffix') || '';
    var duration = 1500;
    var start    = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 2);
      el.textContent = Math.floor(eased * target) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target + suffix;
      }
    }
    requestAnimationFrame(step);
  }
}());


/* ============================================================
   8. CONTACT FORM
   ============================================================ */
(function initContactForm() {
  var form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var isValid = true;

    function setError(inputId, errorId, condition) {
      var input = document.getElementById(inputId);
      var error = document.getElementById(errorId);
      if (!input || !error) return;
      if (condition) {
        input.classList.add('error');
        error.classList.add('show');
        isValid = false;
      } else {
        input.classList.remove('error');
        error.classList.remove('show');
      }
    }

    var name    = document.getElementById('cf-name');
    var email   = document.getElementById('cf-email');
    var message = document.getElementById('cf-message');

    setError('cf-name',    'err-name',    !name    || name.value.trim().length < 2);
    setError('cf-email',   'err-email',   !email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
    setError('cf-message', 'err-message', !message || message.value.trim().length < 10);

    if (isValid) {
      var success   = document.getElementById('form-success');
      var submitBtn = document.getElementById('submit-btn');
      var nameVal    = name.value.trim();
      var emailVal   = email.value.trim();
      var phoneEl    = document.getElementById('cf-phone');
      var phoneVal   = phoneEl ? phoneEl.value.trim() : '';
      var messageVal = message.value.trim();

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

      var sbUrl = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL ? SUPABASE_URL : ((window.__ENV__ && window.__ENV__.SUPABASE_URL) || 'https://ilduyhuvpiqhvbnocqxf.supabase.co'));
      var key = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY : ((window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || ''));

      fetch(sbUrl + '/rest/v1/contact_messages', {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ name: nameVal, email: emailVal, phone: phoneVal, subject: 'General Enquiry', message: messageVal })
      })
      .then(function(res) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Message'; }
        if (res.ok) {
          if (success) { success.classList.add('show'); form.reset(); setTimeout(function(){ success.classList.remove('show'); }, 5000); }
          // Trigger email notification via sendEmail Edge Function (best-effort, non-blocking)
          fetch(sbUrl + '/functions/v1/sendEmail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            body: JSON.stringify({
              type: 'contact_enquiry',
              name: nameVal,
              email: emailVal,
              phone: phoneVal,
              subject: 'General Enquiry',
              message: messageVal,
              submittedAt: new Date().toISOString()
            })
          }).catch(function(e) { console.warn('[Contact] Email notification failed:', e); });
        } else {
          alert('Failed to send message. Please try again.');
        }
      })
      .catch(function(err) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Message'; }
        alert('Error: ' + err.message);
      });
    }
  });

  form.querySelectorAll('.form-input, .form-textarea').forEach(function(field) {
    field.addEventListener('input', function() {
      this.classList.remove('error');
      var errorEl = document.getElementById('err-' + this.id.replace('cf-', ''));
      if (errorEl) errorEl.classList.remove('show');
    });
  });
}());


/* ============================================================
   9. LEGACY ACTIVE NAV LINK (old .navbar__link pages)
   ============================================================ */
(function setLegacyActiveNavLink() {
  try {
    var path = window.location.pathname;
    var page = path.split('/').filter(Boolean).pop() || 'index.html';
    document.querySelectorAll('.navbar__link').forEach(function(link) {
      var href     = link.getAttribute('href') || '';
      var linkPage = href.split('/').filter(Boolean).pop() || '';
      if (linkPage === page || (page === '' && linkPage === 'index.html')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  } catch(e) {}
}());


/* ============================================================
   10. HOMEPAGE FEATURED EVENT POPUP
   Driven by Supabase: events WHERE is_featured=true AND is_active=true
   Shows an elegant, Azzurra-styled popup modal on the homepage.
   Dismissal stored in sessionStorage per event ID.
   ============================================================ */
function initHomepageFeaturedEventPopup() {
  var isHomepage = document.getElementById('hero') ||
                   window.location.pathname.endsWith('index.html') ||
                   window.location.pathname === '/' ||
                   window.location.pathname.endsWith('/azzura/') ||
                   window.location.pathname.endsWith('/azzura');
  if (!isHomepage) return;

  var SUPA_URL = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL ? SUPABASE_URL : ((window.__ENV__ && window.__ENV__.SUPABASE_URL) || 'https://ilduyhuvpiqhvbnocqxf.supabase.co'));
  var SUPA_KEY = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY : ((window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg'));

  fetch(SUPA_URL + '/rest/v1/events?is_featured=eq.true&is_active=eq.true&order=display_order.asc,created_at.desc&limit=1', {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Accept': 'application/json'
    }
  })
  .then(function(res) {
    if (!res.ok) return null;
    return res.json();
  })
  .then(function(events) {
    if (!events || !events.length) return;
    var ev = events[0];

    // Check if dismissed in this session
    var storageKey = 'azzurra_fep_dismissed_' + ev.id;
    if (sessionStorage.getItem(storageKey)) return;

    // Resolve main image
    var imgUrl = ev.banner_image_url;
    if (!imgUrl && ev.images) {
      try {
        var imgs = Array.isArray(ev.images) ? ev.images : JSON.parse(ev.images || '[]');
        if (imgs && imgs.length) imgUrl = imgs[0];
      } catch(_) {}
    }
    if (!imgUrl) return; // Only show popup if an image exists

    // Format date
    var dateStr = '';
    if (ev.date) {
      try {
        var dt = new Date(ev.date + 'T00:00:00');
        dateStr = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch(_) { dateStr = ev.date; }
    }

    var locationStr = ev.city || ev.location || '';
    var metaHtml = '';
    if (dateStr) metaHtml += '<span>📅 ' + dateStr + '</span>';
    if (locationStr) metaHtml += '<span>📍 ' + locationStr + '</span>';
    if (ev.event_type) metaHtml += '<span>🏷️ ' + ev.event_type + '</span>';

    var backdrop = document.createElement('div');
    backdrop.className = 'fep-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', ev.title || 'Featured Event');

    backdrop.innerHTML =
      '<div class="fep-card">' +
        '<div class="fep-img-wrap">' +
          '<img src="' + imgUrl + '" alt="' + (ev.title || 'Featured Event') + '" loading="eager" />' +
          '<span class="fep-badge">★ Featured Event</span>' +
          '<button type="button" class="fep-close-btn" aria-label="Close featured event popup">&times;</button>' +
        '</div>' +
        '<div class="fep-body">' +
          (metaHtml ? '<div class="fep-meta">' + metaHtml + '</div>' : '') +
          '<h3 class="fep-title">' + (ev.title || 'Upcoming Event') + '</h3>' +
          (ev.short_description ? '<p class="fep-desc">' + ev.short_description + '</p>' : '') +
          '<div class="fep-actions">' +
            '<a href="events.html?event=' + ev.id + '" class="fep-btn-primary">View Event Details &rarr;</a>' +
            '<button type="button" class="fep-btn-secondary fep-dismiss-btn">Maybe Later</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    function closePopup() {
      backdrop.classList.remove('open');
      try { sessionStorage.setItem(storageKey, '1'); } catch(_) {}
      setTimeout(function() {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      }, 350);
    }

    var closeBtn = backdrop.querySelector('.fep-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closePopup);
    var dismissBtn = backdrop.querySelector('.fep-dismiss-btn');
    if (dismissBtn) dismissBtn.addEventListener('click', closePopup);

    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) closePopup();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && backdrop.classList.contains('open')) closePopup();
    });

    document.body.appendChild(backdrop);

    // Smooth entrance after slight delay
    setTimeout(function() {
      backdrop.classList.add('open');
    }, 650);
  })
  .catch(function(err) {
    console.warn('[Azzurra] Featured event popup error:', err);
  });
}

/* ============================================================
   11. INIT ON DOM READY
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
  initNavbar();
  updateCartBadge();
  initHomepageFeaturedEventPopup();
});

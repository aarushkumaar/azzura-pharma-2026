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

      var url = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL ? SUPABASE_URL : ((window.__ENV__ && window.__ENV__.SUPABASE_URL) || 'https://ilduyhuvpiqhvbnocqxf.supabase.co')) + '/rest/v1/contact_messages';
      var key = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY : ((window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || ''));

      fetch(url, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ name: nameVal, email: emailVal, phone: phoneVal, subject: 'General Enquiry', message: messageVal })
      })
      .then(function(res) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Message'; }
        if (res.ok) {
          if (success) { success.classList.add('show'); form.reset(); setTimeout(function(){ success.classList.remove('show'); }, 5000); }
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
   10. INIT ON DOM READY
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
  initNavbar();
  updateCartBadge();
});

/* ============================================================
   AZZURRA — Customer Authentication (customer-auth.js)
   Handles customer sign-up, sign-in, sign-out, session mgmt.
   Uses Supabase Auth — same project as admin but separate flow.
   Customer session stored in Supabase's default localStorage keys.
   Credentials are read from the global SUPABASE_URL / SUPABASE_ANON_KEY
   defined in config.js (loaded before this file).
   ============================================================ */
'use strict';

(function () {
  /* ── Use global credentials from config.js or env-config.js ── */
  var _URL = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) ? SUPABASE_URL : (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
  var _KEY = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';

  /* ── Supabase client for customers ── */
  var _sbClient = null;
  function getClient() {
    if (!_sbClient) {
      /* Re-read globals in case config.js loaded after this file */
      if (!_URL) _URL = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) ? SUPABASE_URL : (window.__ENV__ && window.__ENV__.SUPABASE_URL) || '';
      if (!_KEY) _KEY = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || '';
      if (!_URL || !_KEY) {
        console.error('[Azzurra] Supabase credentials missing — check config.js');
        return null;
      }
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        _sbClient = window.supabase.createClient(_URL, _KEY, {
          auth: { storageKey: 'azzurra_customer_auth' }
        });
      }
    }
    return _sbClient;
  }

  /* ── Get current session ── */
  window.getCustomerSession = async function () {
    var sb = getClient();
    if (!sb) return null;
    try {
      var res = await sb.auth.getSession();
      return res.data && res.data.session ? res.data.session : null;
    } catch (_) { return null; }
  };

  /* ── Get current user (lightweight check) ── */
  window.getCurrentCustomer = async function () {
    var session = await window.getCustomerSession();
    return session ? session.user : null;
  };

  /* ── Sync Customer Profile & Customer Table ── */
  window.syncCustomerData = async function (user, extraData) {
    if (!user) return;
    var sb = getClient();
    if (!sb) return;
    var email = user.email || (extraData && extraData.email) || '';
    var meta = user.user_metadata || {};
    var name = (extraData && extraData.name) || meta.full_name || meta.name || (email ? email.split('@')[0] : '');
    var phone = (extraData && extraData.phone) || meta.phone || user.phone || '';
    var nowIso = new Date().toISOString();

    var isBrandNewUser = false;

    // 1. Sync to customer_profiles (by user_id)
    if (user.id) {
      try {
        var existing = await sb.from('customer_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
        if (!existing || !existing.data) {
          isBrandNewUser = true;
        }
        var profilePayload = {
          user_id: user.id,
          full_name: name,
          updated_at: nowIso
        };
        if (phone && phone.trim()) profilePayload.phone = phone.trim();
        await sb.from('customer_profiles').upsert(profilePayload, { onConflict: 'user_id' });
      } catch (_) {}
    }

    // 2. Sync to customers table (by email) for Admin Panel Customers
    if (email) {
      try {
        var custPayload = {
          name: name || email,
          email: email,
          last_activity: nowIso
        };
        if (phone && phone.trim()) custPayload.phone = phone.trim();
        await sb.from('customers').upsert(custPayload, { onConflict: 'email' });
      } catch (_) {}
    }

    // 3. For Google OAuth: send welcome email only on first account creation (never on re-login)
    if (isBrandNewUser && user.app_metadata && user.app_metadata.provider === 'google' && email) {
      var welcomeKey = 'azzurra_welcome_sent_' + user.id;
      if (!localStorage.getItem(welcomeKey)) {
        try {
          localStorage.setItem(welcomeKey, '1');
          var sessionRes = await sb.auth.getSession();
          var _token = (sessionRes && sessionRes.data && sessionRes.data.session) ? sessionRes.data.session.access_token : _KEY;
          if (_URL && _token) {
            fetch(_URL + '/functions/v1/sendEmail', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _token
              },
              body: JSON.stringify({
                type: 'welcome',
                email: email,
                name: name || email.split('@')[0]
              })
            }).catch(function(e) { console.warn('[OAuth Welcome] email failed:', e); });
          }
        } catch (_) {}
      }
    }
  };

  /* ── Sign Up ── */
  window.customerSignUp = async function (email, password, fullName) {
    var sb = getClient();
    if (!sb) throw new Error('Auth not available');
    var base = window.location.href.replace(/[^/]*(\?.*)?$/, '');
    var redirectUrl = base + 'customer-auth.html';
    var res = await sb.auth.signUp({
      email: email,
      password: password,
      options: { 
        data: { full_name: fullName || '' },
        emailRedirectTo: redirectUrl
      }
    });
    if (res.error) {
      /* Improve 500 / SMTP error message */
      var msg = res.error.message || '';
      if (res.error.status === 500 || msg.toLowerCase().indexOf('internal') !== -1 ||
          msg.toLowerCase().indexOf('sending') !== -1 || msg.toLowerCase().indexOf('smtp') !== -1) {
        throw new Error(
          'Account creation is temporarily unavailable. ' +
          'Please try signing in with Google instead, or contact support.'
        );
      }
      throw res.error;
    }
    /* Sync customer profile and customers table */
    if (res.data && res.data.user) {
      await window.syncCustomerData(res.data.user, { name: fullName, email: email });
      /* Send welcome email on account creation (best-effort, non-blocking) */
      try {
        var _token = (res.data.session && res.data.session.access_token) ? res.data.session.access_token : _KEY;
        if (_URL && _token) {
          fetch(_URL + '/functions/v1/sendEmail', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + _token
            },
            body: JSON.stringify({
              type: 'welcome',
              email: email,
              name: fullName || (email ? email.split('@')[0] : '')
            })
          }).catch(function(e) { console.warn('[customerSignUp] Welcome email failed:', e); });
        }
      } catch(_) { /* non-critical */ }
    }
    return res.data;
  };

  /* ── Sign In ── */
  window.customerSignIn = async function (email, password) {
    var sb = getClient();
    if (!sb) throw new Error('Auth not available');
    var res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw res.error;
    /* Ensure profile row and customers row exist */
    if (res.data && res.data.user) {
      await window.syncCustomerData(res.data.user, { email: email });
    }
    return res.data;
  };

  /* ── Sign Out ── */
  window.customerSignOut = async function () {
    var sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
  };

  /* ── Forgot Password ── */
  window.customerForgotPassword = async function (email) {
    var sb = getClient();
    if (!sb) throw new Error('Auth not available');
    /* Build redirect URL relative to current page location */
    var base = window.location.href.replace(/[^/]*(\?.*)?$/, '');
    var redirectUrl = base + 'customer-auth.html?mode=reset';
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (res.error) throw res.error;
    return true;
  };

  /* ── Update Password (after reset link click) ── */
  window.customerUpdatePassword = async function (newPassword) {
    var sb = getClient();
    if (!sb) throw new Error('Auth not available');
    var res = await sb.auth.updateUser({ password: newPassword });
    if (res.error) throw res.error;
    return true;
  };

  /* ── Google OAuth ── */
  window.customerSignInWithGoogle = async function () {
    var sb = getClient();
    if (!sb) throw new Error('Auth not available');
    var base = window.location.href.replace(/[^/]*(\?.*)?$/, '');
    var res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: base + 'customer-auth.html' }
    });
    if (res.error) throw res.error;
    return res;
  };

  /* ── Expose the Supabase client for dashboard use ── */
  window.getCustomerSupabase = getClient;

  /* ── Update account nav icon on all pages ── */
  async function updateAccountNav() {
    var accountLinks = document.querySelectorAll('.navbar__account-link, .navbar__account-btn');
    if (!accountLinks.length) return;
    var user = await window.getCurrentCustomer();
    accountLinks.forEach(function (el) {
      if (user) {
        var name = (user.user_metadata && user.user_metadata.full_name) ? user.user_metadata.full_name : user.email;
        var initials = name.trim().split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2);
        el.setAttribute('href', 'customer-dashboard.html');
        el.setAttribute('title', 'My Account — ' + name);
        el.setAttribute('aria-label', 'My Account');
        var existing = el.querySelector('.navbar__account-initials');
        if (!existing) {
          el.innerHTML = '<span class="navbar__account-initials" aria-hidden="true">' + initials + '</span>';
        } else {
          existing.textContent = initials;
        }
      } else {
        var returnTo = encodeURIComponent(window.location.href);
        el.setAttribute('href', 'customer-auth.html?returnTo=' + returnTo);
        el.setAttribute('title', 'Sign In / Create Account');
        el.setAttribute('aria-label', 'Sign In');
        el.innerHTML = '<span aria-hidden="true">&#128100;</span>';
      }
    });
  }

  /* Run on every page that includes this script */
  document.addEventListener('DOMContentLoaded', function () {
    updateAccountNav();
  });

})();

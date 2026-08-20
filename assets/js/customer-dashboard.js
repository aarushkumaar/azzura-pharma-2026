/* ============================================================
   AZZURRA — Customer Dashboard JavaScript (customer-dashboard.js)
   Handles all data operations for the customer dashboard page.
   Requires: supabase CDN + customer-auth.js loaded first.
   ============================================================ */
'use strict';

window.CustomerDashboard = (function () {
  var _sb    = null;
  var _user  = null;
  var _SUPABASE_URL      = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
  var _SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmt(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ── Init: verify session ── */
  async function init() {
    _sb = window.getCustomerSupabase ? window.getCustomerSupabase() : null;
    var session = _sb ? (await _sb.auth.getSession()).data.session : null;
    if (!session) {
      window.location.replace('customer-auth.html?returnTo=' + encodeURIComponent(window.location.href));
      return;
    }
    _user = session.user;

    // Ensure profile row exists for OAuth users (and others)
    var name = (_user.user_metadata && _user.user_metadata.full_name) || '';
    if (name || _user.email) {
      try {
        var profileRes = await _sb.from('customer_profiles').select('user_id').eq('user_id', _user.id).single();
        if (!profileRes.data) {
          await _sb.from('customer_profiles').insert({
            user_id:    _user.id,
            full_name:  name || _user.email,
            updated_at: new Date().toISOString()
          });
        }
      } catch (e) {
        // Ignored: profile likely exists or other error
      }
    }

    var emailEl = document.getElementById('dash-user-email');
    if (emailEl) emailEl.textContent = _user.email;
    var nameEl = document.getElementById('dash-user-name');
    if (nameEl) {
      var displayName = (_user.user_metadata && _user.user_metadata.full_name) || _user.email;
      nameEl.textContent = displayName;
    }
    document.body.style.opacity = '1';
    showTab('profile');
  }

  /* ── Tab navigation ── */
  function showTab(name) {
    document.querySelectorAll('.dash-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.dash-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'dash-panel-' + name); });
    switch (name) {
      case 'profile':   loadProfile();   break;
      case 'addresses': loadAddresses(); break;
      case 'orders':    loadOrders();    break;
      case 'wishlist':  loadWishlist();  break;
      case 'settings':  break;
    }
  }

  /* ── Profile ── */
  async function loadProfile() {
    if (!_sb || !_user) return;
    var r = await _sb.from('customer_profiles').select('*').eq('user_id', _user.id).single();
    var profile = r.data || {};
    var nameEl  = document.getElementById('profile-name');
    var phoneEl = document.getElementById('profile-phone');
    var emailEl = document.getElementById('profile-email');
    if (nameEl)  nameEl.value  = profile.full_name || (_user.user_metadata && _user.user_metadata.full_name) || '';
    if (phoneEl) phoneEl.value = profile.phone || '';
    if (emailEl) emailEl.value = _user.email || '';
  }

  async function saveProfile() {
    if (!_sb || !_user) return;
    var nameEl  = document.getElementById('profile-name');
    var phoneEl = document.getElementById('profile-phone');
    var name  = nameEl  ? nameEl.value.trim()  : '';
    var phone = phoneEl ? phoneEl.value.trim() : '';
    var r = await _sb.from('customer_profiles').upsert({
      user_id:    _user.id,
      full_name:  name,
      phone:      phone,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (r.error) throw r.error;
    await _sb.auth.updateUser({ data: { full_name: name } });
    return true;
  }

  /* ── Addresses ── */
  async function loadAddresses() {
    if (!_sb || !_user) return;
    var container = document.getElementById('addresses-container');
    if (!container) return;
    container.innerHTML = '<p style="color:#6B7280;font-size:14px;">Loading...</p>';
    var r = await _sb.from('customer_addresses').select('*').eq('user_id', _user.id).order('is_default', { ascending: false });
    var addrs = r.data || [];
    if (!addrs.length) {
      container.innerHTML = '<p style="color:#6B7280;font-size:14px;">No saved addresses yet. Add one below.</p>';
      return;
    }
    container.innerHTML = addrs.map(function(a) {
      return '<div class="addr-card" id="addr-' + a.id + '">'
        + '<div class="addr-card__label">' + esc(a.label||'Address') + (a.is_default ? ' <span class="addr-default-badge">Default</span>' : '') + '</div>'
        + '<div class="addr-card__name">' + esc(a.full_name||'') + ' &mdash; ' + esc(a.phone||'') + '</div>'
        + '<div class="addr-card__line">' + esc(a.address_line||'') + '</div>'
        + '<div class="addr-card__line">' + esc([a.city,a.state,a.pincode].filter(Boolean).join(', ')) + '</div>'
        + '<div class="addr-card__actions">'
        + (a.is_default ? '' : '<button class="addr-btn" onclick="CustomerDashboard.setDefaultAddress(' + a.id + ')">Set Default</button> ')
        + '<button class="addr-btn addr-btn--danger" onclick="CustomerDashboard.deleteAddress(' + a.id + ')">Delete</button>'
        + '</div></div>';
    }).join('');
  }

  async function addAddress(data) {
    if (!_sb || !_user) return;
    var r = await _sb.from('customer_addresses').insert({ user_id: _user.id, ...data });
    if (r.error) throw r.error;
    await loadAddresses();
  }

  async function deleteAddress(id) {
    if (!window.confirm('Delete this address?')) return;
    if (!_sb || !_user) return;
    await _sb.from('customer_addresses').delete().eq('id', id).eq('user_id', _user.id);
    await loadAddresses();
  }

  async function setDefaultAddress(id) {
    if (!_sb || !_user) return;
    await _sb.from('customer_addresses').update({ is_default: false }).eq('user_id', _user.id);
    await _sb.from('customer_addresses').update({ is_default: true  }).eq('id', id).eq('user_id', _user.id);
    await loadAddresses();
  }

  /* ── Orders ── */
  async function loadOrders() {
    if (!_sb || !_user) return;
    var container = document.getElementById('orders-container');
    if (!container) return;
    container.innerHTML = '<p style="color:#6B7280;font-size:14px;">Loading orders...</p>';
    var r = await _sb.from('orders')
      .select('*')
      .or('customer_email.eq.' + _user.email + ',customer_user_id.eq.' + _user.id)
      .order('created_at', { ascending: false });
    var orders = r.data || [];
    if (!orders.length) {
      container.innerHTML = '<p style="color:#6B7280;font-size:14px;">No orders yet. <a href="productss.html" style="color:var(--color-primary);">Start shopping</a></p>';
      return;
    }
    container.innerHTML = '<div class="orders-list">'
      + orders.map(function(o) {
          var items = [];
          try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(_) {}
          var itemsText = items.map(function(i){ return esc(i.name||'Product') + ' ×' + (i.quantity||1); }).join(', ');
          var pmBadge = o.payment_method === 'cod' ? '<span style="background:#FFF3E0;color:#E65100;font-size:11px;padding:2px 8px;border-radius:12px;margin-left:6px;">COD</span>' : '';
          return '<div class="order-card">'
            + '<div class="order-card__header">'
            + '<span class="order-card__id">Order #' + String(o.id).padStart(6,'0') + '</span>'
            + '<span class="order-card__date">' + fmt(o.created_at) + '</span>'
            + '</div>'
            + '<div class="order-card__meta">'
            + '<span class="order-card__items">' + itemsText + '</span>'
            + '</div>'
            + '<div class="order-card__footer">'
            + '<strong style="color:var(--color-primary);">&#8377;' + Number(o.total_amount||0).toLocaleString('en-IN') + '</strong>'
            + pmBadge
            + '<span class="order-status order-status--' + (o.status||'pending') + '">' + esc(o.status||'pending') + '</span>'
            + '</div></div>';
        }).join('')
      + '</div>';
  }

  /* ── Wishlist ── */
  async function loadWishlist() {
    if (!_sb || !_user) return;
    var container = document.getElementById('wishlist-container');
    if (!container) return;
    container.innerHTML = '<p style="color:#6B7280;font-size:14px;">Loading wishlist...</p>';
    var r = await _sb.from('customer_profiles').select('wishlist').eq('user_id', _user.id).single();
    var raw = r.data && r.data.wishlist ? r.data.wishlist : '[]';
    var ids = [];
    try { ids = JSON.parse(raw); } catch(_) {}
    if (!ids.length) {
      container.innerHTML = '<p style="color:#6B7280;font-size:14px;">Your wishlist is empty.</p>';
      return;
    }
    var pr = await _sb.from('products').select('id,name,price_inr,images,series').in('id', ids);
    var products = pr.data || [];
    if (!products.length) { container.innerHTML = '<p style="color:#6B7280;font-size:14px;">Your wishlist is empty.</p>'; return; }
    container.innerHTML = '<div class="wishlist-grid">'
      + products.map(function(p) {
          var imgs = [];
          try { imgs = JSON.parse(p.images||'[]'); } catch(_) {}
          var img = imgs[0] || '';
          var imgHtml = img ? '<img src="' + img.replace('/image/upload/','/image/upload/f_auto,q_auto,w_200/') + '" alt="' + esc(p.name) + '" style="width:100%;height:100%;object-fit:cover;" />' : '';
          return '<div class="wishlist-card">'
            + '<div style="width:80px;height:80px;border-radius:10px;overflow:hidden;border:1.5px solid #D1E3F8;background:#f8fbff;flex-shrink:0;">' + imgHtml + '</div>'
            + '<div style="flex:1;">'
            + '<div style="font-weight:600;font-size:14px;margin-bottom:2px;">' + esc(p.name) + '</div>'
            + '<div style="font-size:12px;color:#6B7280;">' + esc(p.series||'') + '</div>'
            + '<div style="font-weight:700;color:var(--color-primary);margin-top:4px;">&#8377;' + Number(p.price_inr||0).toLocaleString('en-IN') + '</div>'
            + '</div>'
            + '<div><a href="product-detail.html?id=' + p.id + '" class="btn btn--primary" style="padding:8px 16px;font-size:13px;">View</a></div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  /* ── Settings: Change Password ── */
  async function changePassword(newPwd) {
    var sb = window.getCustomerSupabase ? window.getCustomerSupabase() : null;
    if (!sb) throw new Error('Not available');
    var r = await sb.auth.updateUser({ password: newPwd });
    if (r.error) throw r.error;
    return true;
  }

  /* ── Sign Out ── */
  async function signOut() {
    await window.customerSignOut();
    window.location.replace('index.html');
  }

  return {
    init:               init,
    showTab:            showTab,
    saveProfile:        saveProfile,
    addAddress:         addAddress,
    deleteAddress:      deleteAddress,
    setDefaultAddress:  setDefaultAddress,
    changePassword:     changePassword,
    signOut:            signOut
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  CustomerDashboard.init();
});

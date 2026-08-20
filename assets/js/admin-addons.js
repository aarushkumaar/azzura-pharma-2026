/* ============================================================
   AZZURRA — ADMIN ADDONS JAVASCRIPT (admin-addons.js)
   Extends the admin panel with Coupons, Notify Me, Enquiries,
   and Banner management features.
   ============================================================ */
'use strict';

(function () {
  var sb = null;

  // Wait until window.adminSupabase is active or check at load
  function initAddons() {
    sb = window.adminSupabase;
    if (!sb) {
      setTimeout(initAddons, 200);
      return;
    }
    
    // Extend navigation
    if (window.showSection) {
      var origShowSection = window.showSection;
      window.showSection = function (name) {
        origShowSection(name);
        
        // Custom sections handling
        if (name === 'coupons')   loadCoupons();
        if (name === 'notify_me') loadNotifyRequests();
        if (name === 'enquiries') loadEnquiries();
        if (name === 'banners')   loadBanners();
      };
    }

    // Attach form and panel close triggers
    wirePanelControls();
    
    // Listen to sidebar nav click events for our new elements
    document.querySelectorAll('.sidebar-link[data-section]').forEach(function (link) {
      if (['coupons', 'notify_me', 'enquiries', 'banners'].indexOf(link.dataset.section) !== -1) {
        link.addEventListener('click', function () {
          window.showSection(link.dataset.section);
        });
      }
    });
  }

  /* ── Helper: esc html ── */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  /* ── Helper: date formatting ── */
  function fmtDate(ts) {
    if (!ts) return '&mdash;';
    return new Date(ts).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /* ── PANEL CONTROLS ── */
  function openCustomPanel(panelId) {
    var panel = document.getElementById(panelId);
    var overlay = document.getElementById('panel-overlay');
    if (panel) panel.classList.add('open');
    if (overlay) overlay.classList.add('open');
  }

  function closeCustomPanel(panelId) {
    var panel = document.getElementById(panelId);
    var overlay = document.getElementById('panel-overlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  }

  function wirePanelControls() {
    // Coupons panel close
    var closeCoupon = document.getElementById('btn-close-coupon-panel');
    var cancelCoupon = document.getElementById('btn-cancel-coupon-panel');
    if (closeCoupon) closeCoupon.addEventListener('click', function() { closeCustomPanel('coupon-panel'); });
    if (cancelCoupon) cancelCoupon.addEventListener('click', function() { closeCustomPanel('coupon-panel'); });

    // Banners panel close
    var closeBanner = document.getElementById('btn-close-banner-panel');
    var cancelBanner = document.getElementById('btn-cancel-banner-panel');
    if (closeBanner) closeBanner.addEventListener('click', function() { closeCustomPanel('banner-panel'); });
    if (cancelBanner) cancelBanner.addEventListener('click', function() { closeCustomPanel('banner-panel'); });

    // Overlay click closes all panels
    var overlay = document.getElementById('panel-overlay');
    if (overlay) {
      overlay.addEventListener('click', function() {
        closeCustomPanel('coupon-panel');
        closeCustomPanel('banner-panel');
      });
    }

    // Add coupon trigger
    var addCouponBtn = document.getElementById('btn-add-coupon');
    if (addCouponBtn) {
      addCouponBtn.addEventListener('click', function() {
        document.getElementById('coupon-form').reset();
        document.getElementById('form-coupon-id').value = '';
        document.getElementById('coupon-panel-title').textContent = 'Add Coupon';
        openCustomPanel('coupon-panel');
      });
    }

    // Add banner trigger
    var addBannerBtn = document.getElementById('btn-add-banner');
    if (addBannerBtn) {
      addBannerBtn.addEventListener('click', function() {
        document.getElementById('banner-form').reset();
        document.getElementById('form-banner-id').value = '';
        document.getElementById('banner-panel-title').textContent = 'Add Banner';
        openCustomPanel('banner-panel');
      });
    }

    // Form Submits
    var couponForm = document.getElementById('coupon-form');
    if (couponForm) {
      couponForm.addEventListener('submit', saveCoupon);
    }

    var bannerForm = document.getElementById('banner-form');
    if (bannerForm) {
      bannerForm.addEventListener('submit', saveBanner);
    }
  }

  /* ── 1. COUPONS SECTION ── */
  async function loadCoupons() {
    var tbody = document.getElementById('coupons-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="9"><div class="spinner"></div></td></tr>';
    
    try {
      var r = await sb.from('coupons').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var coupons = r.data || [];
      
      if (!coupons.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><p>No coupons found. Create one now.</p></td></tr>';
        return;
      }
      
      tbody.innerHTML = coupons.map(function (c) {
        var statusBadge = c.is_active 
          ? '<span class="badge badge-confirmed">Active</span>'
          : '<span class="badge badge-cancelled">Inactive</span>';
        
        var limit = c.usage_limit != null ? c.usage_limit : 'Unlimited';
        var expiry = c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('en-IN') : 'None';
        
        return '<tr>'
          + '<td style="font-weight:700;">' + esc(c.code) + '</td>'
          + '<td>' + esc(c.discount_type) + '</td>'
          + '<td>' + esc(c.discount_value) + (c.discount_type === 'percentage' ? '%' : ' ₹') + '</td>'
          + '<td>₹ ' + esc(c.min_order_value) + '</td>'
          + '<td>' + limit + '</td>'
          + '<td>' + esc(c.used_count) + '</td>'
          + '<td>' + expiry + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>'
            + '<button class="action-btn-edit" onclick="AdminAddons.editCoupon(' + c.id + ')">Edit</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteCoupon(' + c.id + ')">Delete</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><p>Error loading coupons.</p></td></tr>';
      if (window.showToast) window.showToast('Load failed: ' + err.message, 'error');
    }
  }

  async function saveCoupon(e) {
    e.preventDefault();
    var code = document.getElementById('form-coupon-code').value.trim().toUpperCase();
    var type = document.getElementById('form-coupon-type').value;
    var value = parseFloat(document.getElementById('form-coupon-value').value);
    var min = parseFloat(document.getElementById('form-coupon-min').value) || 0;
    var limit = parseInt(document.getElementById('form-coupon-limit').value) || null;
    var expiry = document.getElementById('form-coupon-expiry').value || null;
    var perCust = document.getElementById('form-coupon-per-customer').checked;
    var active = document.getElementById('form-coupon-active').checked;
    var id = document.getElementById('form-coupon-id').value;

    if (!code || isNaN(value)) {
      if (window.showToast) window.showToast('Please fill in required fields.', 'warning');
      return;
    }

    var payload = {
      code: code,
      discount_type: type,
      discount_value: value,
      min_order_value: min,
      usage_limit: limit,
      expiry_date: expiry,
      per_customer: perCust,
      is_active: active
    };

    var btn = document.getElementById('btn-save-coupon');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      var r;
      if (id) {
        r = await sb.from('coupons').update(payload).eq('id', id);
      } else {
        r = await sb.from('coupons').insert(payload);
      }
      if (r.error) throw r.error;
      
      closeCustomPanel('coupon-panel');
      loadCoupons();
      if (window.showToast) window.showToast('Coupon saved successfully!', 'success');
    } catch (err) {
      if (window.showToast) window.showToast('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Coupon'; }
    }
  }

  window.AdminAddons = window.AdminAddons || {};
  
  window.AdminAddons.editCoupon = async function(id) {
    try {
      var r = await sb.from('coupons').select('*').eq('id', id).single();
      if (r.error) throw r.error;
      var c = r.data;
      
      document.getElementById('form-coupon-id').value = c.id;
      document.getElementById('form-coupon-code').value = c.code;
      document.getElementById('form-coupon-type').value = c.discount_type;
      document.getElementById('form-coupon-value').value = c.discount_value;
      document.getElementById('form-coupon-min').value = c.min_order_value;
      document.getElementById('form-coupon-limit').value = c.usage_limit || '';
      document.getElementById('form-coupon-expiry').value = c.expiry_date || '';
      document.getElementById('form-coupon-per-customer').checked = !!c.per_customer;
      document.getElementById('form-coupon-active').checked = !!c.is_active;
      
      document.getElementById('coupon-panel-title').textContent = 'Edit Coupon: ' + c.code;
      openCustomPanel('coupon-panel');
    } catch(err) {
      if (window.showToast) window.showToast('Fetch failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.deleteCoupon = async function(id) {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      var r = await sb.from('coupons').delete().eq('id', id);
      if (r.error) throw r.error;
      loadCoupons();
      if (window.showToast) window.showToast('Coupon deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  /* ── 2. NOTIFY ME SECTION ── */
  async function loadNotifyRequests() {
    var tbody = document.getElementById('notify-me-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="4"><div class="spinner"></div></td></tr>';

    try {
      var r = await sb.from('notify_me_requests').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var reqs = r.data || [];

      if (!reqs.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No back-in-stock notification requests.</p></td></tr>';
        return;
      }

      tbody.innerHTML = reqs.map(function (req) {
        return '<tr>'
          + '<td style="font-weight:600;">' + esc(req.product_name) + '</td>'
          + '<td>' + esc(req.email) + '</td>'
          + '<td>' + fmtDate(req.created_at) + '</td>'
          + '<td>'
            + '<button class="btn-primary" style="padding:4px 10px;font-size:12px;border-radius:4px;" onclick="AdminAddons.notifyCustomer(' + req.id + ', \'' + esc(req.email) + '\')">Send Notification</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteNotify(' + req.id + ')">Remove</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Error loading notification requests.</p></td></tr>';
    }
  }

  window.AdminAddons.notifyCustomer = function(id, email) {
    alert('This would trigger an email notification to ' + email + ' once SMTP is integrated.');
  };

  window.AdminAddons.deleteNotify = async function(id) {
    if (!confirm('Remove this request?')) return;
    try {
      var r = await sb.from('notify_me_requests').delete().eq('id', id);
      if (r.error) throw r.error;
      loadNotifyRequests();
      if (window.showToast) window.showToast('Request removed', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  /* ── 3. CUSTOMER ENQUIRIES SECTION ── */
  async function loadEnquiries() {
    var tbody = document.getElementById('enquiries-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="7"><div class="spinner"></div></td></tr>';

    try {
      var r = await sb.from('contact_messages').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var msgs = r.data || [];

      if (!msgs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No messages received yet.</p></td></tr>';
        return;
      }

      tbody.innerHTML = msgs.map(function (m) {
        var statusBadge = m.status === 'resolved'
          ? '<span class="badge badge-delivered">Resolved</span>'
          : '<span class="badge badge-pending">Open</span>';
        
        var actionBtn = m.status !== 'resolved'
          ? '<button class="btn-primary" style="padding:4px 10px;font-size:12px;border-radius:4px;" onclick="AdminAddons.resolveEnquiry(' + m.id + ')">Resolve</button> &nbsp;'
          : '';

        return '<tr>'
          + '<td style="font-weight:600;">' + esc(m.name) + '</td>'
          + '<td>' + esc(m.email) + '</td>'
          + '<td>' + esc(m.phone || '—') + '</td>'
          + '<td style="font-size:13px;max-width:300px;white-space:normal;line-height:1.4;">' + esc(m.message) + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>' + fmtDate(m.created_at) + '</td>'
          + '<td>'
            + actionBtn
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteEnquiry(' + m.id + ')">Delete</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>Error loading enquiries.</p></td></tr>';
    }
  }

  window.AdminAddons.resolveEnquiry = async function(id) {
    try {
      var r = await sb.from('contact_messages').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
      if (r.error) throw r.error;
      loadEnquiries();
      if (window.showToast) window.showToast('Enquiry marked resolved', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Resolve failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.deleteEnquiry = async function(id) {
    if (!confirm('Delete this message permanently?')) return;
    try {
      var r = await sb.from('contact_messages').delete().eq('id', id);
      if (r.error) throw r.error;
      loadEnquiries();
      if (window.showToast) window.showToast('Enquiry deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  /* ── 4. HOMEPAGE BANNERS SECTION ── */
  async function loadBanners() {
    var tbody = document.getElementById('banners-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6"><div class="spinner"></div></td></tr>';

    try {
      var r = await sb.from('homepage_banners').select('*').order('display_order', { ascending: true });
      if (r.error) throw r.error;
      var banners = r.data || [];

      if (!banners.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No banners added yet. Add one below.</p></td></tr>';
        return;
      }

      tbody.innerHTML = banners.map(function (b) {
        var statusBadge = b.is_enabled
          ? '<span class="badge badge-confirmed">Enabled</span>'
          : '<span class="badge badge-cancelled">Disabled</span>';
        
        var imgUrl = b.image_url.replace('/image/upload/', '/image/upload/f_auto,q_auto,w_150/');
        var imgHtml = '<img src="' + esc(imgUrl) + '" alt="Banner Preview" style="max-height:50px;border-radius:6px;border:1px solid var(--color-border);" />';

        return '<tr>'
          + '<td>' + esc(b.display_order) + '</td>'
          + '<td>' + imgHtml + '</td>'
          + '<td>' + esc(b.title || 'Untitled Banner') + '</td>'
          + '<td><a href="' + esc(b.link_url) + '" target="_blank" style="color:var(--color-primary);">' + esc(b.link_url || 'None') + '</a></td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>'
            + '<button class="action-btn-edit" onclick="AdminAddons.editBanner(' + b.id + ')">Edit</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteBanner(' + b.id + ')">Delete</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Error loading banners.</p></td></tr>';
    }
  }

  async function saveBanner(e) {
    e.preventDefault();
    var title = document.getElementById('form-banner-title').value.trim();
    var image = document.getElementById('form-banner-image').value.trim();
    var link = document.getElementById('form-banner-link').value.trim();
    var order = parseInt(document.getElementById('form-banner-order').value) || 0;
    var enabled = document.getElementById('form-banner-enabled').checked;
    var id = document.getElementById('form-banner-id').value;

    if (!image) {
      if (window.showToast) window.showToast('Please enter the Image URL.', 'warning');
      return;
    }

    var payload = {
      title: title,
      image_url: image,
      link_url: link,
      display_order: order,
      is_enabled: enabled
    };

    var btn = document.getElementById('btn-save-banner');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      var r;
      if (id) {
        r = await sb.from('homepage_banners').update(payload).eq('id', id);
      } else {
        r = await sb.from('homepage_banners').insert(payload);
      }
      if (r.error) throw r.error;

      closeCustomPanel('banner-panel');
      loadBanners();
      if (window.showToast) window.showToast('Banner saved successfully!', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Banner'; }
    }
  }

  window.AdminAddons.editBanner = async function(id) {
    try {
      var r = await sb.from('homepage_banners').select('*').eq('id', id).single();
      if (r.error) throw r.error;
      var b = r.data;

      document.getElementById('form-banner-id').value = b.id;
      document.getElementById('form-banner-title').value = b.title || '';
      document.getElementById('form-banner-image').value = b.image_url;
      document.getElementById('form-banner-link').value = b.link_url || '';
      document.getElementById('form-banner-order').value = b.display_order;
      document.getElementById('form-banner-enabled').checked = !!b.is_enabled;

      document.getElementById('banner-panel-title').textContent = 'Edit Banner: ' + (b.title || 'Untitled');
      openCustomPanel('banner-panel');
    } catch(err) {
      if (window.showToast) window.showToast('Fetch failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.deleteBanner = async function(id) {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    try {
      var r = await sb.from('homepage_banners').delete().eq('id', id);
      if (r.error) throw r.error;
      loadBanners();
      if (window.showToast) window.showToast('Banner deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  // Run on start
  initAddons();
})();

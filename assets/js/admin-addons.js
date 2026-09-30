/* ============================================================
   AZZURRA — ADMIN ADDONS JAVASCRIPT (admin-addons.js)
   Extends the admin panel with Coupons, Notify Me, Enquiries,
   Homepage Banners, and Central Email & Notifications management.
   ============================================================ */
'use strict';

(function () {
  var SUPABASE_URL = (typeof window !== 'undefined' && window.SUPABASE_URL) || 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
  var SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

  var sb = null;

  function getSupabase() {
    if (sb) return sb;
    if (typeof window !== 'undefined' && window.adminSupabase) {
      sb = window.adminSupabase;
      return sb;
    }
    if (typeof window !== 'undefined' && window.supabase) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.adminSupabase = sb;
      return sb;
    }
    return null;
  }

  // Helper: escape html
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper: date formatting
  function fmtDate(ts) {
    if (!ts) return '&mdash;';
    return new Date(ts).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
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

    // Overlay click closes all custom panels
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
        var form = document.getElementById('coupon-form');
        if (form) form.reset();
        document.getElementById('form-coupon-id').value = '';
        document.getElementById('coupon-panel-title').textContent = 'Add Coupon';
        openCustomPanel('coupon-panel');
      });
    }

    // Add banner trigger
    var addBannerBtn = document.getElementById('btn-add-banner');
    if (addBannerBtn) {
      addBannerBtn.addEventListener('click', function() {
        var form = document.getElementById('banner-form');
        if (form) form.reset();
        document.getElementById('form-banner-id').value = '';
        document.getElementById('banner-panel-title').textContent = 'Add Banner';
        if (window.bannerImgUploadZone && typeof window.bannerImgUploadZone.setImage === 'function') {
          window.bannerImgUploadZone.setImage('');
        }
        openCustomPanel('banner-panel');
      });
    }

    // Form Submits
    var couponForm = document.getElementById('coupon-form');
    if (couponForm) couponForm.addEventListener('submit', saveCoupon);

    var bannerForm = document.getElementById('banner-form');
    if (bannerForm) bannerForm.addEventListener('submit', saveBanner);
  }

  /* ════════════════════════════════════════════════════════════
     1. COUPONS SECTION
     ════════════════════════════════════════════════════════════ */
  async function loadCoupons() {
    var client = getSupabase();
    var tbody = document.getElementById('coupons-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="9"><div class="spinner"></div></td></tr>';

    if (!client) {
      setTimeout(loadCoupons, 200);
      return;
    }

    try {
      var r = await client.from('coupons').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var coupons = r.data || [];

      if (!coupons.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">🎟️</div><p>No coupons found. Create your first coupon to get started.</p></td></tr>';
        return;
      }

      tbody.innerHTML = coupons.map(function (c) {
        var statusBadge = c.is_active 
          ? '<span class="badge badge-confirmed" style="cursor:pointer;" onclick="AdminAddons.toggleCouponStatus(' + c.id + ', false)" title="Click to Deactivate">Active</span>'
          : '<span class="badge badge-cancelled" style="cursor:pointer;" onclick="AdminAddons.toggleCouponStatus(' + c.id + ', true)" title="Click to Activate">Inactive</span>';

        var limit = c.usage_limit != null ? c.usage_limit : 'Unlimited';
        var expiry = c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('en-IN') : 'None';
        var valueFormatted = (c.discount_type === 'percentage') ? (c.discount_value + '%') : ('₹ ' + c.discount_value);

        return '<tr>'
          + '<td style="font-weight:700;font-family:monospace;font-size:14px;color:var(--color-primary);">' + esc(c.code) + '</td>'
          + '<td style="text-transform:capitalize;">' + esc(c.discount_type) + '</td>'
          + '<td style="font-weight:600;">' + esc(valueFormatted) + '</td>'
          + '<td>₹ ' + esc(c.min_order_value || 0) + '</td>'
          + '<td>' + limit + '</td>'
          + '<td>' + esc(c.used_count || 0) + '</td>'
          + '<td style="font-size:13px;">' + expiry + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>'
            + '<button class="action-btn-edit" onclick="AdminAddons.editCoupon(' + c.id + ')" title="Edit">✏️ Edit</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteCoupon(' + c.id + ')" title="Delete">🗑️</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state" style="color:var(--color-red);"><p>Error loading coupons: ' + esc(err.message) + '</p></td></tr>';
      if (window.showToast) window.showToast('Coupons load failed: ' + err.message, 'error');
    }
  }

  async function saveCoupon(e) {
    e.preventDefault();
    var client = getSupabase();
    if (!client) return;

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
      if (window.showToast) window.showToast('Please enter coupon code and discount value.', 'warning');
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
        r = await client.from('coupons').update(payload).eq('id', id);
      } else {
        r = await client.from('coupons').insert(payload);
      }
      if (r.error) throw r.error;

      closeCustomPanel('coupon-panel');
      await loadCoupons();
      if (window.showToast) window.showToast('✓ Coupon saved successfully!', 'success');
    } catch (err) {
      if (window.showToast) window.showToast('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Coupon'; }
    }
  }

  /* ════════════════════════════════════════════════════════════
     2. HOMEPAGE BANNERS SECTION
     ════════════════════════════════════════════════════════════ */
  async function loadBanners() {
    var client = getSupabase();
    var tbody = document.getElementById('banners-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6"><div class="spinner"></div></td></tr>';

    if (!client) {
      setTimeout(loadBanners, 200);
      return;
    }

    try {
      var r = await client.from('homepage_banners').select('*').order('display_order', { ascending: true });
      if (r.error) throw r.error;
      var banners = r.data || [];

      if (!banners.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-icon">🖼️</div><p>No banners added yet. Add a new banner above.</p></td></tr>';
        return;
      }

      tbody.innerHTML = banners.map(function (b) {
        var statusBadge = b.is_enabled
          ? '<span class="badge badge-confirmed" style="cursor:pointer;" onclick="AdminAddons.toggleBannerStatus(' + b.id + ', false)" title="Click to Disable">Enabled</span>'
          : '<span class="badge badge-cancelled" style="cursor:pointer;" onclick="AdminAddons.toggleBannerStatus(' + b.id + ', true)" title="Click to Enable">Disabled</span>';

        var imgUrl = b.image_url || '';
        var thumbUrl = imgUrl.includes('/image/upload/') ? imgUrl.replace('/image/upload/', '/image/upload/f_auto,q_auto,w_180/') : imgUrl;
        var imgHtml = imgUrl
          ? '<img src="' + esc(thumbUrl) + '" alt="Banner Preview" style="max-height:48px;max-width:120px;border-radius:6px;border:1px solid var(--color-border);object-fit:cover;" />'
          : '<span style="color:var(--color-grey);font-size:12px;">No Image</span>';

        return '<tr>'
          + '<td style="font-weight:700;">' + esc(b.display_order) + '</td>'
          + '<td>' + imgHtml + '</td>'
          + '<td style="font-weight:600;">' + esc(b.title || 'Untitled Banner') + '</td>'
          + '<td>' + (b.link_url ? '<a href="' + esc(b.link_url) + '" target="_blank" style="color:var(--color-primary);font-size:13px;word-break:break-all;">' + esc(b.link_url) + ' ↗</a>' : '<span style="color:var(--color-grey);">None</span>') + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>'
            + '<button class="action-btn-edit" onclick="AdminAddons.editBanner(' + b.id + ')">Edit</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteBanner(' + b.id + ')">Delete</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:var(--color-red);"><p>Error loading banners: ' + esc(err.message) + '</p></td></tr>';
    }
  }

  async function saveBanner(e) {
    e.preventDefault();
    var client = getSupabase();
    if (!client) return;

    var title = document.getElementById('form-banner-title').value.trim();
    var image = document.getElementById('form-banner-image').value.trim();
    var link = document.getElementById('form-banner-link').value.trim();
    var order = parseInt(document.getElementById('form-banner-order').value) || 0;
    var enabled = document.getElementById('form-banner-enabled').checked;
    var id = document.getElementById('form-banner-id').value;

    if (!image) {
      if (window.showToast) window.showToast('Please select or upload a banner image.', 'warning');
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
        r = await client.from('homepage_banners').update(payload).eq('id', id);
      } else {
        r = await client.from('homepage_banners').insert(payload);
      }
      if (r.error) throw r.error;

      closeCustomPanel('banner-panel');
      await loadBanners();
      if (window.showToast) window.showToast('✓ Banner saved successfully!', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Banner'; }
    }
  }

  /* ════════════════════════════════════════════════════════════
     3. NOTIFY ME SECTION
     ════════════════════════════════════════════════════════════ */
  async function loadNotifyRequests() {
    var client = getSupabase();
    var tbody = document.getElementById('notify-me-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="4"><div class="spinner"></div></td></tr>';

    if (!client) {
      setTimeout(loadNotifyRequests, 200);
      return;
    }

    try {
      var r = await client.from('notify_me_requests').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var reqs = r.data || [];

      if (!reqs.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><div class="empty-icon">🔔</div><p>No back-in-stock notification requests.</p></td></tr>';
        return;
      }

      tbody.innerHTML = reqs.map(function (req) {
        return '<tr>'
          + '<td style="font-weight:600;">' + esc(req.product_name) + '</td>'
          + '<td><a href="mailto:' + esc(req.email) + '" style="color:var(--color-primary);">' + esc(req.email) + '</a></td>'
          + '<td style="font-size:13px;color:var(--color-grey);">' + fmtDate(req.created_at) + '</td>'
          + '<td>'
            + '<a href="mailto:' + esc(req.email) + '?subject=' + encodeURIComponent('Back in Stock: ' + req.product_name) + '" class="btn-secondary" style="padding:3px 10px;font-size:12px;text-decoration:none;display:inline-block;">✉️ Reply</a> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteNotify(' + req.id + ')">Remove</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state" style="color:var(--color-red);"><p>Error loading notification requests: ' + esc(err.message) + '</p></td></tr>';
    }
  }

  /* ════════════════════════════════════════════════════════════
     4. CUSTOMER ENQUIRIES SECTION
     ════════════════════════════════════════════════════════════ */
  async function loadEnquiries() {
    var client = getSupabase();
    var tbody = document.getElementById('enquiries-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="7"><div class="spinner"></div></td></tr>';

    if (!client) {
      setTimeout(loadEnquiries, 200);
      return;
    }

    try {
      var r = await client.from('contact_messages').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var msgs = r.data || [];

      if (!msgs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">✉️</div><p>No customer messages received yet.</p></td></tr>';
        return;
      }

      tbody.innerHTML = msgs.map(function (m) {
        var status = (m.status || 'open').toLowerCase();
        var statusSelect = '<select class="status-select" style="font-size:12px;padding:3px 6px;" onchange="AdminAddons.updateEnquiryStatus(' + m.id + ', this.value)">'
          + '<option value="open" ' + (status === 'open' ? 'selected' : '') + '>Open</option>'
          + '<option value="in_progress" ' + (status === 'in_progress' ? 'selected' : '') + '>In Progress</option>'
          + '<option value="resolved" ' + (status === 'resolved' ? 'selected' : '') + '>Resolved</option>'
          + '</select>';

        var priority = m.priority || 'Normal';
        var priorityBadge = '<span class="badge" style="background:' + (priority === 'Urgent' ? '#FEE2E2;color:#991B1B' : priority === 'High' ? '#FFEDD5;color:#9A3412' : '#F1F5F9;color:#475569') + ';font-size:11px;">' + esc(priority) + '</span>';

        return '<tr>'
          + '<td style="font-weight:600;">' + esc(m.name) + '<br>' + priorityBadge + '</td>'
          + '<td><a href="mailto:' + esc(m.email) + '" style="color:var(--color-primary);font-size:13px;">' + esc(m.email) + '</a></td>'
          + '<td style="font-size:13px;">' + esc(m.phone || '—') + '</td>'
          + '<td style="font-size:13px;max-width:280px;white-space:normal;line-height:1.4;">'
            + '<div style="font-weight:600;margin-bottom:2px;">' + esc(m.subject || 'Enquiry') + '</div>'
            + '<div>' + esc(m.message) + '</div>'
            + (m.internal_notes ? '<div style="margin-top:4px;padding:4px 6px;background:#FEF9C3;color:#854D0E;border-radius:4px;font-size:11px;">Note: ' + esc(m.internal_notes) + '</div>' : '')
          + '</td>'
          + '<td>' + statusSelect + '</td>'
          + '<td style="font-size:12px;color:var(--color-grey);">' + fmtDate(m.created_at) + '</td>'
          + '<td>'
            + '<a href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Re: ' + (m.subject || 'Azzurra Enquiry')) + '" class="btn-secondary" style="padding:2px 8px;font-size:11px;text-decoration:none;display:inline-block;" title="Reply by email">✉️ Reply</a> &nbsp;'
            + '<button class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="AdminAddons.promptEnquiryNote(' + m.id + ', \'' + (m.internal_notes || '').replace(/'/g, "\\'") + '\')">Note</button> &nbsp;'
            + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;" onclick="AdminAddons.deleteEnquiry(' + m.id + ')" title="Delete">🗑️</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state" style="color:var(--color-red);"><p>Error loading enquiries: ' + esc(err.message) + '</p></td></tr>';
    }
  }

  /* ════════════════════════════════════════════════════════════
     5. EMAIL & NOTIFICATIONS SECTION
     ════════════════════════════════════════════════════════════ */
  async function loadEmailSettings() {
    await loadAdminRecipients();
    await loadEmailLogs();
  }

  async function loadAdminRecipients() {
    var client = getSupabase();
    var list = document.getElementById('admin-recipients-list');
    var countEl = document.getElementById('admin-recipients-count');
    if (!list) return;

    if (!client) {
      setTimeout(loadAdminRecipients, 200);
      return;
    }

    try {
      var r = await client.from('admin_email_recipients').select('*').order('created_at', { ascending: true });
      if (r.error) throw r.error;
      var recipients = r.data || [];

      var activeCount = recipients.filter(function(x) { return x.is_enabled; }).length;
      if (countEl) countEl.textContent = activeCount + ' active';

      if (!recipients.length) {
        list.innerHTML = '<div style="font-size:13px;color:var(--color-grey);padding:8px 0;">No admin notification emails configured. Add one below.</div>';
        return;
      }

      list.innerHTML = recipients.map(function(rcp) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;">'
          + '<div style="display:flex;align-items:center;gap:10px;">'
            + '<label class="toggle-switch" style="transform:scale(0.85);">'
              + '<input type="checkbox" ' + (rcp.is_enabled ? 'checked' : '') + ' onchange="AdminAddons.toggleRecipientEnabled(' + rcp.id + ', this.checked)" />'
              + '<span class="toggle-slider"></span>'
            + '</label>'
            + '<span style="font-size:13.5px;font-weight:' + (rcp.is_enabled ? '600' : '400') + ';color:' + (rcp.is_enabled ? '#1E293B' : '#94A3B8') + ';">' + esc(rcp.email) + '</span>'
          + '</div>'
          + '<button class="action-btn-delete" style="color:var(--color-red);background:none;border:none;cursor:pointer;font-size:14px;" onclick="AdminAddons.deleteEmailRecipient(' + rcp.id + ')" title="Remove recipient">&times;</button>'
          + '</div>';
      }).join('');
    } catch(err) {
      list.innerHTML = '<div style="color:var(--color-red);font-size:13px;">Failed to load email recipients: ' + esc(err.message) + '</div>';
    }
  }

  async function addEmailRecipient() {
    var client = getSupabase();
    var input = document.getElementById('input-new-recipient-email');
    if (!input || !client) return;
    var email = input.value.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (window.showToast) window.showToast('Please enter a valid email address.', 'warning');
      return;
    }

    try {
      var r = await client.from('admin_email_recipients').insert({ email: email, is_enabled: true });
      if (r.error) throw r.error;
      input.value = '';
      await loadAdminRecipients();
      if (window.showToast) window.showToast('✓ Admin recipient added', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Failed to add email: ' + err.message, 'error');
    }
  }

  async function toggleRecipientEnabled(id, isEnabled) {
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('admin_email_recipients').update({ is_enabled: isEnabled }).eq('id', id);
      if (r.error) throw r.error;
      await loadAdminRecipients();
      if (window.showToast) window.showToast(isEnabled ? '✓ Recipient enabled' : 'Recipient disabled', 'info');
    } catch(err) {
      if (window.showToast) window.showToast('Toggle failed: ' + err.message, 'error');
    }
  }

  async function deleteEmailRecipient(id) {
    if (!confirm('Remove this email recipient from administrative notifications?')) return;
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('admin_email_recipients').delete().eq('id', id);
      if (r.error) throw r.error;
      await loadAdminRecipients();
      if (window.showToast) window.showToast('Recipient removed', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  }

  async function sendTestEmail() {
    var input = document.getElementById('test-email-recipient');
    var resultEl = document.getElementById('test-email-result');
    var btn = document.getElementById('btn-send-test-email');
    var targetEmail = input ? input.value.trim().toLowerCase() : '';

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      if (window.showToast) window.showToast('Please enter a valid recipient email.', 'warning');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending Test…'; }
    if (resultEl) { resultEl.style.display = 'none'; }

    try {
      var client = getSupabase();
      var session = client && (await client.auth.getSession()).data.session;
      var token = session ? session.access_token : SUPABASE_ANON_KEY;

      var res = await fetch(SUPABASE_URL + '/functions/v1/sendEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          type: 'test_email',
          toEmail: targetEmail
        })
      });

      var data = await res.json();
      if (resultEl) {
        resultEl.style.display = 'block';
        if (data.success) {
          resultEl.style.background = '#F0FDF4';
          resultEl.style.border = '1.5px solid #48BB78';
          resultEl.style.color = '#15803D';
          resultEl.innerHTML = '<strong>✓ Test email sent successfully!</strong><br><span style="font-size:12px;">Dispatched to ' + esc(targetEmail) + ' via Resend. Check your inbox.</span>';
          if (window.showToast) window.showToast('✓ Test email sent successfully!', 'success');
        } else {
          resultEl.style.background = '#FFF5F5';
          resultEl.style.border = '1.5px solid #FC8181';
          resultEl.style.color = '#B91C1C';
          resultEl.innerHTML = '<strong>✕ Failed to send test email</strong><br><span style="font-size:12px;">' + esc(data.error || 'Unknown error occurred.') + '</span>';
          if (window.showToast) window.showToast('Test failed: ' + (data.error || 'Unknown error'), 'error');
        }
      }
      await loadEmailLogs();
    } catch(err) {
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#FFF5F5';
        resultEl.style.border = '1.5px solid #FC8181';
        resultEl.style.color = '#B91C1C';
        resultEl.innerHTML = '<strong>✕ Request failed:</strong> ' + esc(err.message);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Test Email'; }
    }
  }

  async function loadEmailLogs() {
    var client = getSupabase();
    var tbody = document.getElementById('email-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6"><div class="spinner"></div></td></tr>';

    if (!client) {
      setTimeout(loadEmailLogs, 200);
      return;
    }

    try {
      var r = await client.from('email_logs').select('*').order('created_at', { ascending: false }).limit(50);
      if (r.error) throw r.error;
      var logs = r.data || [];

      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No email delivery activity recorded yet.</p></td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(function(l) {
        var statusBadge = l.status === 'sent'
          ? '<span class="badge badge-confirmed">Sent</span>'
          : '<span class="badge badge-cancelled" title="' + esc(l.error_message || 'Failed') + '">Failed</span>';

        var orderLink = l.related_order_id
          ? '<a href="javascript:void(0)" onclick="viewCustomerOrder(' + l.related_order_id + ')" style="font-family:monospace;font-weight:700;color:var(--color-primary);">#' + String(l.related_order_id).slice(-8) + '</a>'
          : '<span style="color:var(--color-grey);">—</span>';

        return '<tr>'
          + '<td style="font-size:13px;font-weight:500;">' + esc(l.recipient) + '</td>'
          + '<td><span class="badge" style="background:#F1F5F9;color:#334155;text-transform:capitalize;">' + esc(l.email_type.replace(/_/g, ' ')) + '</span></td>'
          + '<td>' + orderLink + '</td>'
          + '<td style="font-size:12px;color:var(--color-grey);">' + fmtDate(l.sent_at || l.created_at) + '</td>'
          + '<td>' + statusBadge + '</td>'
          + '<td>'
            + '<button class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="AdminAddons.resendEmailLog(' + l.id + ')">↺ Resend</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    } catch(err) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:var(--color-red);"><p>Error loading email logs: ' + esc(err.message) + '</p></td></tr>';
    }
  }

  async function resendEmailLog(logId) {
    if (!confirm('Re-dispatch this email via Resend?')) return;
    try {
      var client = getSupabase();
      var session = client && (await client.auth.getSession()).data.session;
      var token = session ? session.access_token : SUPABASE_ANON_KEY;

      var res = await fetch(SUPABASE_URL + '/functions/v1/sendEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          type: 'resend_email',
          logId: logId
        })
      });

      var data = await res.json();
      if (data.success) {
        if (window.showToast) window.showToast('✓ Resend dispatched successfully!', 'success');
      } else {
        if (window.showToast) window.showToast('Resend failed: ' + (data.error || 'Server error'), 'error');
      }
      await loadEmailLogs();
    } catch(err) {
      if (window.showToast) window.showToast('Resend failed: ' + err.message, 'error');
    }
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC ADMIN ADDONS API
     ════════════════════════════════════════════════════════════ */
  window.AdminAddons = window.AdminAddons || {};

  // Coupons
  window.AdminAddons.loadCoupons = loadCoupons;
  window.AdminAddons.editCoupon = async function(id) {
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('coupons').select('*').eq('id', id).single();
      if (r.error) throw r.error;
      var c = r.data;

      document.getElementById('form-coupon-id').value = c.id;
      document.getElementById('form-coupon-code').value = c.code;
      document.getElementById('form-coupon-type').value = c.discount_type;
      document.getElementById('form-coupon-value').value = c.discount_value;
      document.getElementById('form-coupon-min').value = c.min_order_value || 0;
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
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('coupons').delete().eq('id', id);
      if (r.error) throw r.error;
      await loadCoupons();
      if (window.showToast) window.showToast('Coupon deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.toggleCouponStatus = async function(id, newActive) {
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('coupons').update({ is_active: newActive }).eq('id', id);
      if (r.error) throw r.error;
      await loadCoupons();
      if (window.showToast) window.showToast(newActive ? '✓ Coupon activated' : 'Coupon deactivated', 'info');
    } catch(err) {
      if (window.showToast) window.showToast('Toggle failed: ' + err.message, 'error');
    }
  };

  // Banners
  window.AdminAddons.loadBanners = loadBanners;
  window.AdminAddons.editBanner = async function(id) {
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('homepage_banners').select('*').eq('id', id).single();
      if (r.error) throw r.error;
      var b = r.data;

      document.getElementById('form-banner-id').value = b.id;
      document.getElementById('form-banner-title').value = b.title || '';
      document.getElementById('form-banner-image').value = b.image_url;
      document.getElementById('form-banner-link').value = b.link_url || '';
      document.getElementById('form-banner-order').value = b.display_order;
      document.getElementById('form-banner-enabled').checked = !!b.is_enabled;

      if (window.bannerImgUploadZone && typeof window.bannerImgUploadZone.setImage === 'function') {
        window.bannerImgUploadZone.setImage(b.image_url || '');
      }

      document.getElementById('banner-panel-title').textContent = 'Edit Banner: ' + (b.title || 'Untitled');
      openCustomPanel('banner-panel');
    } catch(err) {
      if (window.showToast) window.showToast('Fetch failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.deleteBanner = async function(id) {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('homepage_banners').delete().eq('id', id);
      if (r.error) throw r.error;
      await loadBanners();
      if (window.showToast) window.showToast('Banner deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.toggleBannerStatus = async function(id, newEnabled) {
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('homepage_banners').update({ is_enabled: newEnabled }).eq('id', id);
      if (r.error) throw r.error;
      await loadBanners();
      if (window.showToast) window.showToast(newEnabled ? '✓ Banner enabled' : 'Banner disabled', 'info');
    } catch(err) {
      if (window.showToast) window.showToast('Toggle failed: ' + err.message, 'error');
    }
  };

  // Notify Me
  window.AdminAddons.loadNotifyRequests = loadNotifyRequests;
  window.AdminAddons.deleteNotify = async function(id) {
    if (!confirm('Remove this notification request?')) return;
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('notify_me_requests').delete().eq('id', id);
      if (r.error) throw r.error;
      await loadNotifyRequests();
      if (window.showToast) window.showToast('Request removed', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  // Enquiries
  window.AdminAddons.loadEnquiries = loadEnquiries;
  window.AdminAddons.updateEnquiryStatus = async function(id, newStatus) {
    var client = getSupabase();
    if (!client) return;
    try {
      var payload = { status: newStatus };
      if (newStatus === 'resolved') payload.resolved_at = new Date().toISOString();
      var r = await client.from('contact_messages').update(payload).eq('id', id);
      if (r.error) throw r.error;
      if (window.showToast) window.showToast('✓ Enquiry status updated', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Status update failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.promptEnquiryNote = async function(id, currentNote) {
    var note = prompt('Enter internal admin note for this enquiry:', currentNote || '');
    if (note == null) return;
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('contact_messages').update({ internal_notes: note }).eq('id', id);
      if (r.error) throw r.error;
      await loadEnquiries();
      if (window.showToast) window.showToast('✓ Note saved', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Save failed: ' + err.message, 'error');
    }
  };

  window.AdminAddons.deleteEnquiry = async function(id) {
    if (!confirm('Delete this message permanently?')) return;
    var client = getSupabase();
    if (!client) return;
    try {
      var r = await client.from('contact_messages').delete().eq('id', id);
      if (r.error) throw r.error;
      await loadEnquiries();
      if (window.showToast) window.showToast('Enquiry deleted', 'success');
    } catch(err) {
      if (window.showToast) window.showToast('Delete failed: ' + err.message, 'error');
    }
  };

  // Email Settings
  window.AdminAddons.loadEmailSettings = loadEmailSettings;
  window.AdminAddons.loadAdminRecipients = loadAdminRecipients;
  window.AdminAddons.addEmailRecipient = addEmailRecipient;
  window.AdminAddons.toggleRecipientEnabled = toggleRecipientEnabled;
  window.AdminAddons.deleteEmailRecipient = deleteEmailRecipient;
  window.AdminAddons.sendTestEmail = sendTestEmail;
  window.AdminAddons.loadEmailLogs = loadEmailLogs;
  window.AdminAddons.resendEmailLog = resendEmailLog;

  /* ════════════════════════════════════════════════════════════
     INITIALIZATION & HOOKS
     ════════════════════════════════════════════════════════════ */
  function initAddons() {
    sb = window.adminSupabase;
    wirePanelControls();

    // Wire sidebar navigation click listeners for all custom sections
    document.querySelectorAll('.sidebar-link[data-section]').forEach(function (link) {
      var sec = link.dataset.section;
      if (['coupons', 'notify_me', 'enquiries', 'banners', 'email_settings'].indexOf(sec) !== -1) {
        link.addEventListener('click', function () {
          if (typeof window.showSection === 'function') {
            window.showSection(sec);
          }
        });
      }
    });

    // Check if an addon section is currently active and immediately load its content
    var activeSec = document.querySelector('.admin-section.active');
    if (activeSec && activeSec.id) {
      var secName = activeSec.id.replace('section-', '');
      if (secName === 'coupons') loadCoupons();
      if (secName === 'banners') loadBanners();
      if (secName === 'notify_me') loadNotifyRequests();
      if (secName === 'enquiries') loadEnquiries();
      if (secName === 'email_settings') loadEmailSettings();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAddons);
  } else {
    initAddons();
  }

})();

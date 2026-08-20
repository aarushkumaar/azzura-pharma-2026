/* ============================================================
   AZZURRA — ADMIN DASHBOARD JAVASCRIPT
   admin.js — Auth guard, section routing, data loading, CRUD,
              Canvas charts, settings.
   Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY,
                           SITE_CONFIG)
   Uses Supabase REST API directly — no npm package needed.
   ============================================================ */

/* ============================================================
   SUPABASE HELPER — authenticated REST requests
   ============================================================ */

/** Storage keys for Supabase session tokens */
const SB_ACCESS_TOKEN  = 'sb-access-token';
const SB_REFRESH_TOKEN = 'sb-refresh-token';

/** Get the current auth token from localStorage */
function getAuthToken() {
  return localStorage.getItem(SB_ACCESS_TOKEN) || SUPABASE_ANON_KEY;
}

/**
 * Make an authenticated Supabase REST request.
 * @param {string} path     — table path e.g. '/rest/v1/products'
 * @param {string} method   — HTTP method
 * @param {Object} [body]   — request body (for POST/PATCH)
 * @param {string} [token]  — override auth token (for service role)
 * @returns {Promise<any>}
 */
async function sbFetch(path, method = 'GET', body = null, token = null) {
  const authTok = token || getAuthToken();
  const opts = {
    method,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${authTok}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : 'return=minimal',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${SUPABASE_URL}${path}`, opts);

  if (res.status === 204) return null; // No content
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error_description || JSON.stringify(data));
  return data;
}

/* ============================================================
   AUTH — Verify user is an admin on page load
   ============================================================ */
let currentAdminUser = null;

async function initAdmin() {
  // Handle magic link token in URL hash (Supabase redirects with #access_token=...)
  await handleMagicLinkCallback();

  const loadingScreen = document.getElementById('admin-loading-screen');
  const adminShell    = document.getElementById('admin-shell');
  const accessDenied  = document.getElementById('admin-access-denied');

  try {
    const token = getAuthToken();
    if (!token || token === SUPABASE_ANON_KEY) throw new Error('No session');

    // Fetch current user from Supabase Auth
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!userRes.ok) throw new Error('Session invalid');
    const user = await userRes.json();
    if (!user?.email) throw new Error('No user email');

    // Check if this email exists in admin_users table
    // (admin_users requires service role — but we check via RPC or by checking if user can fetch the row)
    // For simplicity we use a Supabase RPC that is accessible via anon but checks the table
    // Alternative: fetch admin_users with anon — fails (RLS blocks it) = not admin
    // Better: if the user can read their own admin_users row, they're an admin
    // We use a function column filter approach:
    const adminCheck = await sbFetch(
      `/rest/v1/admin_users?email=eq.${encodeURIComponent(user.email)}&select=email,role`,
      'GET', null, token
    );

    // If we got an empty array or 0 rows, the email isn't in admin_users
    // (the RLS policy blocks the read entirely, so we also need to handle that)
    if (!adminCheck || adminCheck.length === 0) {
      throw new Error('Email not in admin_users');
    }

    currentAdminUser = { ...user, role: adminCheck[0].role };

    // Update UI
    document.getElementById('admin-email-display').textContent = user.email;
    document.getElementById('admin-role-display').textContent  = adminCheck[0].role;
    document.getElementById('admin-avatar').textContent        = user.email[0].toUpperCase();

    // Show dashboard
    loadingScreen.hidden = true;
    adminShell.hidden    = false;

    initDashboard();

  } catch (err) {
    console.warn('[Admin] Auth failed:', err.message);
    loadingScreen.hidden = true;

    if (err.message === 'No session' || err.message === 'Session invalid') {
      // No session at all — redirect to login
      window.location.href = 'admin-login.html';
    } else {
      // Session valid but not an admin
      accessDenied.hidden = false;
    }
  }
}

/** Handle the magic link token in the URL hash after Supabase redirects */
async function handleMagicLinkCallback() {
  const hash   = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken) {
    localStorage.setItem(SB_ACCESS_TOKEN,  accessToken);
    localStorage.setItem(SB_REFRESH_TOKEN, refreshToken || '');
    // Clean the URL so the token isn't visible
    history.replaceState(null, '', window.location.pathname);
  }
}

/* ============================================================
   SECTION ROUTING — hash-based SPA navigation
   ============================================================ */
const SECTIONS = ['overview', 'orders', 'products', 'customers', 'payments', 'settings'];
const SECTION_TITLES = {
  overview:  'Overview',
  orders:    'Orders',
  products:  'Products',
  customers: 'Customers',
  payments:  'Payments',
  settings:  'Settings',
};

let currentSection = 'overview';

function initDashboard() {
  // Date in topbar
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // Nav link clicks
  document.querySelectorAll('.admin-nav__link').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const section = this.dataset.section;
      navigateTo(section);
    });
  });

  // Logout button
  document.getElementById('admin-logout-btn')?.addEventListener('click', adminLogout);

  // Handle browser back/forward
  window.addEventListener('hashchange', function() {
    const section = window.location.hash.replace('#', '') || 'overview';
    if (SECTIONS.includes(section)) navigateTo(section, false);
  });

  // Load initial section from hash or default to overview
  const hash = window.location.hash.replace('#', '') || 'overview';
  navigateTo(SECTIONS.includes(hash) ? hash : 'overview', false);
}

function navigateTo(section, pushState = true) {
  currentSection = section;

  // Update nav active state
  document.querySelectorAll('.admin-nav__link').forEach(function(link) {
    link.classList.toggle('active', link.dataset.section === section);
  });

  // Show/hide sections
  SECTIONS.forEach(function(s) {
    const el = document.getElementById(`section-${s}`);
    if (el) el.hidden = s !== section;
  });

  // Update topbar title
  const titleEl = document.getElementById('section-title');
  if (titleEl) titleEl.textContent = SECTION_TITLES[section] || section;

  // Push URL hash
  if (pushState) history.pushState(null, '', `#${section}`);

  // Lazy-load section data
  loadSection(section);
}

function loadSection(section) {
  switch (section) {
    case 'overview':   loadOverview();   break;
    case 'orders':     loadOrders();     break;
    case 'products':   loadProducts();   break;
    case 'customers':  loadCustomers();  break;
    case 'payments':   loadPayments();   break;
    case 'settings':   loadSettings();   break;
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */
async function adminLogout() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${getAuthToken()}`,
      }
    });
  } catch (_) {}
  localStorage.removeItem(SB_ACCESS_TOKEN);
  localStorage.removeItem(SB_REFRESH_TOKEN);
  window.location.href = 'admin-login.html';
}

/* ============================================================
   SECTION: OVERVIEW
   ============================================================ */
async function loadOverview() {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${year}-${month}-01T00:00:00.000Z`;

    // Fetch this month's orders
    const orders = await sbFetch(
      `/rest/v1/orders?created_at=gte.${monthStart}&status=neq.cancelled&select=id,total_amount,customer_id,created_at,order_items(product_id,quantity)`
    );

    // Fetch customers this month
    const customers = await sbFetch(
      `/rest/v1/customers?created_at=gte.${monthStart}&select=id`
    );

    // Compute KPIs
    const revenue        = (orders || []).reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const orderCount     = (orders || []).length;
    const customerCount  = (customers || []).length;

    // Top product by quantity sold
    const productCounts = {};
    (orders || []).forEach(function(o) {
      (o.order_items || []).forEach(function(item) {
        productCounts[item.product_id] = (productCounts[item.product_id] || 0) + item.quantity;
      });
    });
    const topProductId = Object.keys(productCounts).sort((a, b) => productCounts[b] - productCounts[a])[0];
    let topProductName = '—';
    if (topProductId) {
      const prod = await sbFetch(`/rest/v1/products?id=eq.${topProductId}&select=name`);
      topProductName = prod?.[0]?.name || '—';
    }

    // Update KPI cards
    document.getElementById('kpi-revenue').textContent  = `₹${revenue.toLocaleString('en-IN')}`;
    document.getElementById('kpi-orders').textContent   = orderCount;
    document.getElementById('kpi-customers').textContent = customerCount;
    document.getElementById('kpi-top-product').textContent = topProductName.length > 18
      ? topProductName.substring(0, 18) + '…' : topProductName;

    // Update pending badge in nav
    const pendingOrders = await sbFetch(`/rest/v1/orders?status=eq.pending&select=id`);
    const badge = document.getElementById('pending-badge');
    if (badge && pendingOrders?.length > 0) {
      badge.textContent = pendingOrders.length;
      badge.hidden = false;
    }

    // Draw charts
    drawBarChart(orders || [], year, now.getMonth());
    drawDonutChart(orders || []);

  } catch (err) {
    console.error('[loadOverview]', err);
  }
}

/* ============================================================
   CANVAS CHARTS — pure Canvas API, no external dependencies
   ============================================================ */

/**
 * Draw daily sales bar chart for the current month.
 * @param {Array}  orders  — orders array with created_at and total_amount
 * @param {number} year
 * @param {number} month   — 0-indexed
 */
function drawBarChart(orders, year, month) {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Sum revenue per day
  const dailyRevenue = Array(daysInMonth).fill(0);
  orders.forEach(function(o) {
    const d = new Date(o.created_at).getDate() - 1;
    if (d >= 0 && d < daysInMonth) {
      dailyRevenue[d] += parseFloat(o.total_amount || 0);
    }
  });

  const ctx    = canvas.getContext('2d');
  const W      = canvas.offsetWidth;
  const H      = 220;
  canvas.width  = W;
  canvas.height = H;

  const maxVal   = Math.max(...dailyRevenue, 1);
  const padL     = 48;
  const padR     = 16;
  const padT     = 16;
  const padB     = 32;
  const plotW    = W - padL - padR;
  const plotH    = H - padT - padB;
  const barW     = Math.max(2, (plotW / daysInMonth) - 2);
  const barGap   = plotW / daysInMonth;

  ctx.clearRect(0, 0, W, H);

  // Y-axis gridlines
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * (1 - i / 4));
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle  = '#9ca3af';
    ctx.font       = '10px Inter, sans-serif';
    ctx.textAlign  = 'right';
    ctx.fillText(`₹${Math.round(maxVal * i / 4 / 100) * 100}`, padL - 4, y + 3);
  }

  // Bars
  const today = new Date().getDate();
  dailyRevenue.forEach(function(val, i) {
    const x  = padL + i * barGap + (barGap - barW) / 2;
    const bH = (val / maxVal) * plotH;
    const y  = padT + plotH - bH;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
    grad.addColorStop(0, '#1A5FA8');
    grad.addColorStop(1, 'rgba(26,95,168,0.3)');
    ctx.fillStyle = (i === today - 1) ? '#C9A84C' : grad;

    ctx.beginPath();
    ctx.roundRect(x, y, barW, bH, [3, 3, 0, 0]);
    ctx.fill();

    // Day labels every 5 days
    if ((i + 1) % 5 === 0 || i === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font      = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i + 1, x + barW / 2, H - 6);
    }
  });
}

/**
 * Draw a donut chart of revenue by category.
 * @param {Array} orders
 */
async function drawDonutChart(orders) {
  const canvas = document.getElementById('donut-chart');
  if (!canvas) return;

  // Fetch product categories for each order item
  const categoryRevenue = {
    'Molecular Serums':     0,
    'Cellular Kits':        0,
    'Bio-Devices':          0,
    'Advanced Supplements': 0,
  };

  try {
    // Get all unique product IDs from orders
    const productIds = new Set();
    orders.forEach(function(o) {
      (o.order_items || []).forEach(function(item) { productIds.add(item.product_id); });
    });

    if (productIds.size > 0) {
      const ids   = [...productIds].join(',');
      const prods = await sbFetch(`/rest/v1/products?id=in.(${ids})&select=id,category`);
      const prodMap = {};
      (prods || []).forEach(function(p) { prodMap[p.id] = p.category; });

      const catMap = {
        'molecular_serums':     'Molecular Serums',
        'cellular_kits':        'Cellular Kits',
        'bio_devices':          'Bio-Devices',
        'advanced_supplements': 'Advanced Supplements',
      };

      orders.forEach(function(o) {
        (o.order_items || []).forEach(function(item) {
          const cat  = catMap[prodMap[item.product_id]] || 'Other';
          const rev  = parseFloat(o.total_amount || 0) * item.quantity / (o.order_items.length || 1);
          if (categoryRevenue[cat] !== undefined) categoryRevenue[cat] += rev;
        });
      });
    }
  } catch (_) { /* use empty data */ }

  const COLORS = ['#1A5FA8', '#C9A84C', '#134a87', '#6B7280'];
  const labels = Object.keys(categoryRevenue);
  const values = Object.values(categoryRevenue);
  const total  = values.reduce((s, v) => s + v, 0) || 1;

  const ctx    = canvas.getContext('2d');
  const S      = 180;
  canvas.width  = S;
  canvas.height = S;

  const cx = S / 2;
  const cy = S / 2;
  const R  = S / 2 - 8;
  const r  = R * 0.55; // Inner radius

  let startAngle = -Math.PI / 2;

  values.forEach(function(val, i) {
    const angle = (val / total) * (2 * Math.PI);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    startAngle += angle;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Centre label
  ctx.fillStyle  = '#1A5FA8';
  ctx.font       = 'bold 11px Inter, sans-serif';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Revenue', cx, cy - 7);
  ctx.fillStyle = '#374151';
  ctx.font      = '10px Inter, sans-serif';
  ctx.fillText('by Category', cx, cy + 8);

  // Draw legend
  const legendEl = document.getElementById('donut-legend');
  if (legendEl) {
    legendEl.innerHTML = labels.map(function(label, i) {
      const pct = total > 0 ? Math.round(values[i] / total * 100) : 0;
      return `
        <div class="donut-legend__item">
          <span class="donut-legend__dot" style="background:${COLORS[i % COLORS.length]}"></span>
          <span>${label} — ${pct}%</span>
        </div>`;
    }).join('');
  }
}

/* ============================================================
   SECTION: ORDERS
   ============================================================ */
let allOrders = [];

async function loadOrders() {
  try {
    const data = await sbFetch(
      '/rest/v1/orders?select=id,created_at,total_amount,status,shipping_address,customer_id,order_items(id,product_id,quantity,unit_price,subtotal,products(name))&order=created_at.desc'
    );
    allOrders = data || [];
    renderOrdersTable(allOrders);
    initOrderSearch();
  } catch (err) {
    console.error('[loadOrders]', err);
    document.getElementById('orders-tbody').innerHTML =
      `<tr><td colspan="6" class="table-loading" style="color:#e53e3e;">Error loading orders: ${err.message}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(function(order) {
    const addr = order.shipping_address || {};
    const name = addr.name || '—';
    const date = new Date(order.created_at).toLocaleDateString('en-IN');
    const shortId = order.id.substring(0, 8) + '…';

    return `
      <tr onclick="openOrderPanel('${order.id}')" tabindex="0" role="row" aria-label="Order ${shortId}">
        <td style="font-family:monospace;font-size:12px;" title="${order.id}">${shortId}</td>
        <td>${escHtml(name)}</td>
        <td>${date}</td>
        <td style="font-weight:700;color:var(--color-primary);">₹${Number(order.total_amount).toLocaleString('en-IN')}</td>
        <td><span class="status-badge status-badge--${order.status}">${order.status}</span></td>
        <td onclick="event.stopPropagation();">
          <button class="table-action-btn" onclick="openOrderPanel('${order.id}')">Details</button>
        </td>
      </tr>`;
  }).join('');
}

function initOrderSearch() {
  const searchEl = document.getElementById('orders-search');
  const filterEl = document.getElementById('orders-status-filter');

  function applyOrderFilters() {
    const q   = (searchEl?.value || '').toLowerCase();
    const st  = filterEl?.value || '';
    const filtered = allOrders.filter(function(o) {
      const addr = o.shipping_address || {};
      const matchQ  = !q || o.id.toLowerCase().includes(q) || (addr.name || '').toLowerCase().includes(q);
      const matchSt = !st || o.status === st;
      return matchQ && matchSt;
    });
    renderOrdersTable(filtered);
  }

  searchEl?.addEventListener('input', applyOrderFilters);
  filterEl?.addEventListener('change', applyOrderFilters);
}

function openOrderPanel(orderId) {
  const order   = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const panel   = document.getElementById('order-panel');
  const overlay = document.getElementById('order-panel-overlay');
  const body    = document.getElementById('order-panel-body');

  const addr    = order.shipping_address || {};
  const items   = order.order_items || [];
  const date    = new Date(order.created_at).toLocaleString('en-IN');

  body.innerHTML = `
    <div class="panel-row"><span class="panel-row__label">Order ID</span>
      <span class="panel-row__value" style="font-family:monospace;font-size:11px;">${order.id}</span></div>
    <div class="panel-row"><span class="panel-row__label">Date</span>
      <span class="panel-row__value">${date}</span></div>
    <div class="panel-row"><span class="panel-row__label">Customer</span>
      <span class="panel-row__value">${escHtml(addr.name || '—')}</span></div>
    <div class="panel-row"><span class="panel-row__label">Email</span>
      <span class="panel-row__value">${escHtml(addr.email || '—')}</span></div>
    <div class="panel-row"><span class="panel-row__label">Phone</span>
      <span class="panel-row__value">${escHtml(addr.phone || '—')}</span></div>
    <div class="panel-row"><span class="panel-row__label">Shipping Address</span>
      <span class="panel-row__value">${escHtml([addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '))}</span></div>
    <div class="panel-row"><span class="panel-row__label">Total</span>
      <span class="panel-row__value" style="font-size:18px;color:var(--color-primary);">₹${Number(order.total_amount).toLocaleString('en-IN')}</span></div>

    <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-grey);margin:20px 0 10px;">Items</h3>
    ${items.map(function(item) {
      return `<div class="panel-row">
        <span class="panel-row__label">${escHtml(item.products?.name || item.product_id.substring(0,8))}</span>
        <span class="panel-row__value">×${item.quantity} — ₹${Number(item.subtotal).toLocaleString('en-IN')}</span>
      </div>`;
    }).join('')}

    <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-grey);margin:20px 0 10px;">Update Status</h3>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <select class="panel-status-select" id="panel-status-select">
        ${['pending','paid','processing','shipped','delivered','cancelled'].map(s =>
          `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
      <button class="btn btn--primary" onclick="updateOrderStatus('${order.id}')" style="padding:8px 20px;font-size:13px;">
        Update
      </button>
    </div>`;

  panel.classList.add('open');
  panel.hidden = false;
  overlay.classList.add('show');

  document.getElementById('order-panel-close')?.addEventListener('click', closeOrderPanel, { once: true });
  overlay.addEventListener('click', closeOrderPanel, { once: true });
}

function closeOrderPanel() {
  document.getElementById('order-panel')?.classList.remove('open');
  document.getElementById('order-panel-overlay')?.classList.remove('show');
}

async function updateOrderStatus(orderId) {
  const select = document.getElementById('panel-status-select');
  if (!select) return;
  const newStatus = select.value;

  try {
    await sbFetch(`/rest/v1/orders?id=eq.${orderId}`, 'PATCH', { status: newStatus });
    // Update local data
    const order = allOrders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    renderOrdersTable(allOrders);
    closeOrderPanel();
    showToast('Order status updated.');
  } catch (err) {
    alert(`Failed to update status: ${err.message}`);
  }
}

/* ============================================================
   SECTION: PRODUCTS
   ============================================================ */
let allProductsAdmin = [];

async function loadProducts() {
  try {
    const data = await sbFetch('/rest/v1/products?select=*&order=created_at.desc');
    allProductsAdmin = data || [];
    renderProductsTable(allProductsAdmin);
    initProductSearch();
    initProductModal();
  } catch (err) {
    console.error('[loadProducts]', err);
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">No products found.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(function(p) {
    return `
      <tr>
        <td><img class="product-thumb" src="${p.image_url}" alt="${escHtml(p.name)}" onerror="this.src=''; this.style.background='var(--color-primary-light)';"></td>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td style="text-transform:capitalize;">${p.category.replace(/_/g, ' ')}</td>
        <td style="color:var(--color-primary);font-weight:700;">₹${Number(p.price).toLocaleString('en-IN')}</td>
        <td>${p.stock_quantity}</td>
        <td>
          <label class="table-toggle" title="New Release">
            <input type="checkbox" ${p.is_new_release ? 'checked' : ''} onchange="toggleProductFlag('${p.id}', 'is_new_release', this.checked)" />
            <span class="table-toggle__track"></span>
          </label>
        </td>
        <td>
          <label class="table-toggle" title="Featured">
            <input type="checkbox" ${p.is_featured ? 'checked' : ''} onchange="toggleProductFlag('${p.id}', 'is_featured', this.checked)" />
            <span class="table-toggle__track"></span>
          </label>
        </td>
        <td onclick="event.stopPropagation();">
          <button class="table-action-btn" onclick="openProductModal('${p.id}')">Edit</button>
          <button class="table-action-btn table-action-btn--danger" onclick="deleteProduct('${p.id}', '${escHtml(p.name)}')">Delete</button>
        </td>
      </tr>`;
  }).join('');
}

function initProductSearch() {
  document.getElementById('products-search')?.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    renderProductsTable(
      allProductsAdmin.filter(p => p.name.toLowerCase().includes(q) || p.category.includes(q))
    );
  });
}

function initProductModal() {
  document.getElementById('add-product-btn')?.addEventListener('click', function() {
    openProductModal(null); // null = new product
  });
  document.getElementById('product-modal-close')?.addEventListener('click', closeProductModal);
  document.getElementById('product-cancel-btn')?.addEventListener('click', closeProductModal);
  document.getElementById('product-form')?.addEventListener('submit', saveProduct);
}

function openProductModal(productId) {
  const overlay   = document.getElementById('product-modal-overlay');
  const titleEl   = document.getElementById('product-modal-title');
  const form      = document.getElementById('product-form');
  const product   = productId ? allProductsAdmin.find(p => p.id === productId) : null;

  titleEl.textContent = product ? 'Edit Product' : 'Add Product';
  form.reset();
  document.getElementById('pf-id').value = productId || '';

  if (product) {
    document.getElementById('pf-name').value         = product.name;
    document.getElementById('pf-category').value     = product.category;
    document.getElementById('pf-price').value        = product.price;
    document.getElementById('pf-compare-price').value = product.compare_price || '';
    document.getElementById('pf-rating').value       = product.rating;
    document.getElementById('pf-review-count').value = product.review_count;
    document.getElementById('pf-stock').value        = product.stock_quantity;
    document.getElementById('pf-image-url').value    = product.image_url;
    document.getElementById('pf-description').value  = product.description;
    document.getElementById('pf-new-release').checked = product.is_new_release;
    document.getElementById('pf-featured').checked   = product.is_featured;

    // Need tags
    document.querySelectorAll('input[name="need_tag"]').forEach(function(cb) {
      cb.checked = product.need_tags.includes(cb.value);
    });
  }

  overlay.hidden = false;
}

function closeProductModal() {
  document.getElementById('product-modal-overlay').hidden = true;
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('pf-id').value;

  const needTags = [...document.querySelectorAll('input[name="need_tag"]:checked')].map(cb => cb.value);

  const payload = {
    name:           document.getElementById('pf-name').value.trim(),
    category:       document.getElementById('pf-category').value,
    need_tags:      needTags,
    price:          parseFloat(document.getElementById('pf-price').value),
    compare_price:  document.getElementById('pf-compare-price').value
                      ? parseFloat(document.getElementById('pf-compare-price').value) : null,
    rating:         parseFloat(document.getElementById('pf-rating').value) || 5.0,
    review_count:   parseInt(document.getElementById('pf-review-count').value) || 0,
    stock_quantity: parseInt(document.getElementById('pf-stock').value) || 0,
    image_url:      document.getElementById('pf-image-url').value.trim() || './assets/images/placeholder.jpg',
    description:    document.getElementById('pf-description').value.trim(),
    is_new_release: document.getElementById('pf-new-release').checked,
    is_featured:    document.getElementById('pf-featured').checked,
  };

  const saveBtn = document.getElementById('product-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (id) {
      await sbFetch(`/rest/v1/products?id=eq.${id}`, 'PATCH', payload);
      showToast('Product updated successfully.');
    } else {
      await sbFetch('/rest/v1/products', 'POST', payload);
      showToast('Product added successfully.');
    }
    closeProductModal();
    await loadProducts();
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Product';
  }
}

async function toggleProductFlag(productId, field, value) {
  try {
    await sbFetch(`/rest/v1/products?id=eq.${productId}`, 'PATCH', { [field]: value });
    const product = allProductsAdmin.find(p => p.id === productId);
    if (product) product[field] = value;
  } catch (err) {
    console.error('[toggleProductFlag]', err);
  }
}

async function deleteProduct(productId, productName) {
  if (!confirm(`Delete "${productName}"? This cannot be undone.`)) return;
  try {
    await sbFetch(`/rest/v1/products?id=eq.${productId}`, 'DELETE');
    allProductsAdmin = allProductsAdmin.filter(p => p.id !== productId);
    renderProductsTable(allProductsAdmin);
    showToast('Product deleted.');
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

/* ============================================================
   SECTION: CUSTOMERS
   ============================================================ */
let allCustomers = [];

async function loadCustomers() {
  try {
    // Join customers with their order count and last order date
    const data = await sbFetch(
      '/rest/v1/customers?select=id,email,full_name,phone,created_at,total_lifetime_value,orders(id,created_at,status)&order=created_at.desc'
    );
    allCustomers = data || [];
    renderCustomersTable(allCustomers);
    initCustomerSearch();
  } catch (err) {
    console.error('[loadCustomers]', err);
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody) return;

  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No customers yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(function(c) {
    const orders    = c.orders || [];
    const orderCount = orders.length;
    const lastOrder  = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const lastOrderDate = lastOrder
      ? new Date(lastOrder.created_at).toLocaleDateString('en-IN') : '—';
    const joinedDate = new Date(c.created_at).toLocaleDateString('en-IN');

    return `
      <tr>
        <td>${escHtml(c.full_name || '—')}</td>
        <td>${escHtml(c.email)}</td>
        <td>${escHtml(c.phone || '—')}</td>
        <td>${orderCount}</td>
        <td style="color:var(--color-primary);font-weight:700;">₹${Number(c.total_lifetime_value || 0).toLocaleString('en-IN')}</td>
        <td>${lastOrderDate}</td>
        <td>${joinedDate}</td>
      </tr>`;
  }).join('');
}

function initCustomerSearch() {
  document.getElementById('customers-search')?.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    renderCustomersTable(allCustomers.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    ));
  });
}

/* ============================================================
   SECTION: PAYMENTS
   ============================================================ */
let allPayments = [];

async function loadPayments() {
  try {
    const data = await sbFetch(
      '/rest/v1/payments?select=id,order_id,gateway,gateway_payment_id,amount,currency,status,created_at&order=created_at.desc'
    );
    allPayments = data || [];
    renderPaymentsTable(allPayments);
    initPaymentSearch();
  } catch (err) {
    console.error('[loadPayments]', err);
  }
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;

  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No payment records.</td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(function(p) {
    const shortId      = p.id.substring(0, 8) + '…';
    const shortOrderId = p.order_id.substring(0, 8) + '…';
    const date         = new Date(p.created_at).toLocaleDateString('en-IN');
    const canRefund    = p.status === 'success';

    return `
      <tr>
        <td style="font-family:monospace;font-size:11px;" title="${p.id}">${shortId}</td>
        <td style="font-family:monospace;font-size:11px;" title="${p.order_id}">${shortOrderId}</td>
        <td style="text-transform:capitalize;">${p.gateway}</td>
        <td style="font-weight:700;color:var(--color-primary);">₹${Number(p.amount).toLocaleString('en-IN')}</td>
        <td><span class="status-badge status-badge--${p.status}">${p.status}</span></td>
        <td>${date}</td>
        <td onclick="event.stopPropagation();">
          ${canRefund ? `<button class="table-action-btn table-action-btn--refund" onclick="initiateRefundAdmin('${p.id}')">Refund</button>` : '—'}
        </td>
      </tr>`;
  }).join('');
}

function initPaymentSearch() {
  const searchEl = document.getElementById('payments-search');
  const filterEl = document.getElementById('payments-status-filter');

  function applyPaymentFilters() {
    const q  = (searchEl?.value || '').toLowerCase();
    const st = filterEl?.value || '';
    renderPaymentsTable(allPayments.filter(function(p) {
      const matchQ  = !q || p.id.toLowerCase().includes(q) || p.order_id.toLowerCase().includes(q);
      const matchSt = !st || p.status === st;
      return matchQ && matchSt;
    }));
  }

  searchEl?.addEventListener('input', applyPaymentFilters);
  filterEl?.addEventListener('change', applyPaymentFilters);
}

async function initiateRefundAdmin(paymentId) {
  if (!confirm('Initiate a full refund for this payment? This action cannot be undone.')) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/initiateRefund`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        // Admin passes the service role key (stored separately — not in SUPABASE_ANON_KEY)
        // For security, the service role key should be stored server-side.
        // Here we use the anon key and the Edge Function checks the admin_users table.
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ paymentId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Refund initiated. ID: ${data.refundId}`);
    await loadPayments();
  } catch (err) {
    alert(`Refund failed: ${err.message}`);
  }
}

/* ============================================================
   SECTION: SETTINGS
   ============================================================ */
async function loadSettings() {
  try {
    const settings = await sbFetch('/rest/v1/site_settings?select=key,value');
    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s.value; });

    // Gateway
    const gwVal = settingsMap['active_gateway'] || 'razorpay';
    document.getElementById('gw-razorpay').checked = gwVal === 'razorpay';
    document.getElementById('gw-stripe').checked   = gwVal === 'stripe';

    // Announcement
    const ann = settingsMap['announcement'] || {};
    document.getElementById('announcement-enabled').checked = !!ann.enabled;
    document.getElementById('announcement-text').value      = ann.text || '';

    // Featured products
    const featuredIds = settingsMap['featured_product_ids'] || [];
    await loadFeaturedProductPicker(featuredIds);

  } catch (err) {
    console.error('[loadSettings]', err);
  }

  // Save handlers
  document.getElementById('save-gateway-btn')?.addEventListener('click', saveGateway);
  document.getElementById('save-announcement-btn')?.addEventListener('click', saveAnnouncement);
  document.getElementById('save-featured-btn')?.addEventListener('click', saveFeaturedProducts);
}

async function saveSetting(key, value) {
  await sbFetch(
    `/rest/v1/site_settings?key=eq.${key}`,
    'PATCH',
    { value: JSON.stringify(value) }
  );
}

async function saveGateway() {
  const gw = document.querySelector('input[name="gateway"]:checked')?.value || 'razorpay';
  try {
    await saveSetting('active_gateway', gw);
    showToast(`Payment gateway set to ${gw}.`);
  } catch (err) { alert(err.message); }
}

async function saveAnnouncement() {
  const enabled = document.getElementById('announcement-enabled').checked;
  const text    = document.getElementById('announcement-text').value.trim();
  try {
    await saveSetting('announcement', { enabled, text });
    showToast('Announcement banner saved.');
  } catch (err) { alert(err.message); }
}

async function loadFeaturedProductPicker(featuredIds) {
  const container = document.getElementById('featured-products-list');
  if (!container) return;

  if (allProductsAdmin.length === 0) {
    const data = await sbFetch('/rest/v1/products?select=id,name&order=name.asc');
    allProductsAdmin = data || [];
  }

  container.innerHTML = allProductsAdmin.map(function(p) {
    const selected = featuredIds.includes(p.id);
    return `
      <div class="featured-product-item ${selected ? 'selected' : ''}"
           id="fp-${p.id}"
           onclick="toggleFeaturedProduct('${p.id}')"
           role="checkbox" aria-checked="${selected}" tabindex="0">
        <span style="font-size:18px;">${selected ? '⭐' : '☆'}</span>
        <span class="featured-product-item__name">${escHtml(p.name)}</span>
      </div>`;
  }).join('');
}

function toggleFeaturedProduct(productId) {
  const el = document.getElementById(`fp-${productId}`);
  if (!el) return;
  const isSelected = el.classList.toggle('selected');
  el.setAttribute('aria-checked', isSelected);
  el.querySelector('span').textContent = isSelected ? '⭐' : '☆';

  // Limit to 3
  const selectedEls = document.querySelectorAll('.featured-product-item.selected');
  if (selectedEls.length > 3) {
    el.classList.remove('selected');
    el.setAttribute('aria-checked', 'false');
    el.querySelector('span').textContent = '☆';
    showToast('You can only feature up to 3 products.');
  }
}

async function saveFeaturedProducts() {
  const selectedEls = document.querySelectorAll('.featured-product-item.selected');
  const ids         = [...selectedEls].map(el => el.id.replace('fp-', ''));
  try {
    await saveSetting('featured_product_ids', ids);
    showToast('Featured products updated.');
  } catch (err) { alert(err.message); }
}

/* ============================================================
   HELPERS
   ============================================================ */

/** Escape HTML to prevent XSS */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a toast notification */
let toastTimeout;
function showToast(message, duration = 3000) {
  const toast = document.getElementById('settings-toast') || createToastEl();
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function() {
    toast.classList.remove('show');
  }, duration);
}

function createToastEl() {
  const el = document.createElement('div');
  el.className  = 'admin-toast';
  el.id         = 'settings-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

/* ============================================================
   INIT ON DOM READY
   ============================================================ */
document.addEventListener('DOMContentLoaded', initAdmin);

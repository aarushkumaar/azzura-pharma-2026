/* ============================================================
   AZZURRA — SHOP PAGE JAVASCRIPT
   shop.js — Product loading, filtering, sorting, cart drawer.
   Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY,
                           SITE_CONFIG, RAZORPAY_KEY_ID)
   ============================================================ */

/* FALLBACK DATA — intentionally empty.
   If Supabase is unreachable we show "currently unavailable" rather than
   silently showing fake products that don't exist in inventory.
   Real product data comes exclusively from Supabase. */
const FALLBACK_PRODUCTS = [];


/* Category display names */
const CATEGORY_LABELS = {
  'all':                  'All Products',
  'molecular_serums':     'Molecular Serums',
  'cellular_kits':        'Cellular Kits',
  'bio_devices':          'Bio-Devices',
  'advanced_supplements': 'Advanced Supplements'
};

/* ============================================================
   STATE
   ============================================================ */
let allProducts    = [];         // Full list fetched from Supabase or fallback
let filteredProducts = [];       // After applying filters
let activeCategory = 'all';
let activeNeeds    = new Set();  // Set of active need_tags
let activeSortKey  = 'newest';
let isOffline      = false;

/* ============================================================
   SUPABASE — FETCH PRODUCTS
   Uses the REST API directly (no npm package required).
   Falls back to FALLBACK_PRODUCTS if fetch fails.
   ============================================================ */
async function fetchProductsFromSupabase() {
  try {
    // Build the Supabase REST API URL for the products table
    const url = `${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`;

    const res = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      cache: 'no-store',
      // Timeout after 5 seconds — don't block the shop page too long
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) throw new Error(`Supabase error ${res.status}`);

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[Azzurra Shop] Supabase unavailable, using fallback data.', err.message);
    return null;
  }
}

/* ============================================================
   FILTER & SORT — runs entirely client-side on in-memory array
   ============================================================ */
function applyFilters() {
  let result = [...allProducts];

  // 1. Category filter
  if (activeCategory !== 'all') {
    result = result.filter(p => p.category === activeCategory);
  }

  // 2. Need tag filter — product must have ALL active need tags
  if (activeNeeds.size > 0) {
    result = result.filter(p =>
      [...activeNeeds].every(need => p.need_tags.includes(need))
    );
  }

  // 3. Sort
  switch (activeSortKey) {
    case 'price_low':
      result.sort((a, b) => a.price - b.price);
      break;
    case 'price_high':
      result.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      result.sort((a, b) => b.rating - a.rating || b.review_count - a.review_count);
      break;
    case 'newest':
    default:
      // newest first — Supabase already returns in desc order,
      // fallback data is already newest-first
      break;
  }

  filteredProducts = result;
  renderProducts();
  updateToolbar();
}

/* ============================================================
   RENDER — Product Grid
   ============================================================ */
function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (filteredProducts.length === 0) {
    grid.innerHTML = `
      <div class="shop-empty">
        <span class="shop-empty__icon">🔍</span>
        <h3 class="shop-empty__title">No products found</h3>
        <p class="shop-empty__text">Try adjusting your filters or selecting a different category.</p>
      </div>`;
    return;
  }

  filteredProducts.forEach(function(product) {
    const card = buildProductCard(product);
    grid.appendChild(card);
  });
}

/**
 * Build a single product card DOM element.
 * @param {Object} product — product row from Supabase or fallback
 * @returns {HTMLElement}
 */
function buildProductCard(product) {
  const cartItems = getCart();
  const inCart    = cartItems.some(item => item.id === product.id);

  const el = document.createElement('article');
  el.className   = 'shop-card fade-up';
  el.setAttribute('aria-label', product.name);
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');

  // Stars
  const starsHtml = buildStarsHtml(product.rating);

  // Price
  const priceHtml = product.compare_price
    ? `<span class="shop-card__price">${SITE_CONFIG.currencySymbol}${Number(product.price).toLocaleString('en-IN')}</span>
       <span class="shop-card__compare-price">${SITE_CONFIG.currencySymbol}${Number(product.compare_price).toLocaleString('en-IN')}</span>`
    : `<span class="shop-card__price">${SITE_CONFIG.currencySymbol}${Number(product.price).toLocaleString('en-IN')}</span>`;

  // Badge
  const badgeHtml = product.is_new_release
    ? `<span class="shop-card__badge">New Release</span>` : '';

  // Sale badge (shown if compare_price exists)
  const salePct = product.compare_price
    ? Math.round((1 - product.price / product.compare_price) * 100) : 0;
  const saleBadgeHtml = salePct > 0
    ? `<span class="shop-card__badge shop-card__badge--sale">${salePct}% OFF</span>` : '';

  el.innerHTML = `
    <div class="shop-card__img-wrap" id="img-wrap-${product.id}">
      <img
        class="shop-card__img"
        src="${product.image_url}"
        alt="${product.name}"
        loading="lazy"
        onerror="this.parentElement.classList.add('no-image'); this.style.display='none';"
      />
      ${badgeHtml}
      ${saleBadgeHtml}
      <div class="shop-card__overlay">
        <button class="shop-card__quick-view" onclick="event.stopPropagation(); openProductDetail('${product.id}')">
          Quick View
        </button>
      </div>
    </div>
    <div class="shop-card__body">
      <div class="shop-card__stars">
        ${starsHtml}
        <span class="shop-card__review-count">(${product.review_count})</span>
      </div>
      <h3 class="shop-card__name">${product.name}</h3>
      <p class="shop-card__desc">${product.description}</p>
      <div class="shop-card__footer">
        <div class="shop-card__price-wrap">${priceHtml}</div>
        <button
          class="shop-card__add-btn ${inCart ? 'added' : ''}"
          id="add-btn-${product.id}"
          aria-label="Add ${product.name} to cart"
          onclick="event.stopPropagation(); handleAddToCart('${product.id}')"
          title="${inCart ? 'In cart' : 'Add to cart'}"
        >${inCart ? '✓' : '+'}</button>
      </div>
    </div>`;

  // Click anywhere on card navigates to detail page
  el.addEventListener('click', function() {
    openProductDetail(product.id);
  });

  // Keyboard accessibility
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') openProductDetail(product.id);
  });

  return el;
}

/**
 * Build star rating HTML from a numeric rating (0-5).
 * Uses ★ for filled, ½ trick for halves, ☆ for empty.
 */
function buildStarsHtml(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      html += `<span class="star filled" aria-hidden="true">★</span>`;
    } else if (rating >= i - 0.5) {
      html += `<span class="star half-filled" aria-hidden="true">★</span>`;
    } else {
      html += `<span class="star" aria-hidden="true">☆</span>`;
    }
  }
  return html;
}

/* Update the "Showing X of Y" counter and category heading */
function updateToolbar() {
  const countEl = document.getElementById('product-count');
  if (countEl) {
    countEl.innerHTML = `Showing <strong>${filteredProducts.length}</strong> of <strong>${allProducts.length}</strong> products`;
  }
}

/* ---- Skeleton loaders while fetching ---- */
function showSkeletons(n) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < n; i++) {
    grid.innerHTML += `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-card__img"></div>
        <div class="skeleton-card__body">
          <div class="skeleton-card__line skeleton-card__line--short"></div>
          <div class="skeleton-card__line skeleton-card__line--med"></div>
          <div class="skeleton-card__line skeleton-card__line--med"></div>
        </div>
      </div>`;
  }
}

/* ============================================================
   SIDEBAR INTERACTION
   ============================================================ */
function initSidebar() {
  // Category buttons
  document.querySelectorAll('.category-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activeCategory = this.dataset.category;
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      applyFilters();
    });
  });

  // Need tag pills — multi-select toggle
  document.querySelectorAll('.need-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      const need = this.dataset.need;
      if (activeNeeds.has(need)) {
        activeNeeds.delete(need);
        this.classList.remove('active');
      } else {
        activeNeeds.add(need);
        this.classList.add('active');
      }
      applyFilters();
    });
  });

  // Sort dropdown
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      activeSortKey = this.value;
      applyFilters();
    });
  }
}

/* ============================================================
   CART — localStorage persistence
   ============================================================ */
const CART_KEY = 'azzurra_cart_v1';

/** @returns {Array} cart items array */
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch { return []; }
}

/** @param {Array} items — save full cart array */
function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
  renderCartDrawer();
}

/** Add or increment a product in the cart */
function addToCart(product) {
  const cart = getCart();
  const idx  = cart.findIndex(item => item.id === product.id);

  if (idx > -1) {
    cart[idx].quantity += 1;
  } else {
    cart.push({
      id:          product.id,
      name:        product.name,
      price:       product.price,
      image_url:   product.image_url,
      quantity:    1
    });
  }

  saveCart(cart);
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  saveCart(cart);
}

function updateQuantity(productId, newQty) {
  const cart = getCart();
  const idx  = cart.findIndex(item => item.id === productId);
  if (idx > -1) {
    if (newQty <= 0) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity = newQty;
    }
  }
  saveCart(cart);
}

/** Total items count */
function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

/** Total amount in INR */
function getCartTotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

/** Update the cart badge on the navbar button */
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count > 9 ? '9+' : count;
  badge.classList.toggle('show', count > 0);
}

/** Handle "add to cart" button click on a product card */
function handleAddToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  addToCart(product);

  // Visual feedback on the button
  const btn = document.getElementById(`add-btn-${productId}`);
  if (btn) {
    btn.textContent = '✓';
    btn.classList.add('added');
  }
}

/* ============================================================
   CART DRAWER
   ============================================================ */
function initCartDrawer() {
  // Inject cart button into navbar
  const navLinks = document.querySelector('.navbar__links');
  if (navLinks && !document.getElementById('navbar-cart-btn')) {
    const cartBtn = document.createElement('li');
    cartBtn.innerHTML = `
      <button class="navbar-cart-btn" id="navbar-cart-btn" aria-label="Shopping cart">
        🛒
        <span class="cart-badge" id="cart-badge">0</span>
      </button>`;
    navLinks.appendChild(cartBtn);
    document.getElementById('navbar-cart-btn').addEventListener('click', openCartDrawer);
  }

  // Overlay click closes drawer
  document.getElementById('cart-overlay')?.addEventListener('click', closeCartDrawer);

  // Close button
  document.getElementById('cart-close-btn')?.addEventListener('click', closeCartDrawer);

  // Checkout button
  document.getElementById('cart-checkout-btn')?.addEventListener('click', function() {
    if (getCartCount() === 0) return;
    window.location.href = SITE_CONFIG.checkoutUrl;
  });

  // Continue shopping button
  document.getElementById('cart-continue-btn')?.addEventListener('click', closeCartDrawer);

  updateCartBadge();
  renderCartDrawer();
}

function openCartDrawer() {
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
  renderCartDrawer();
}

function closeCartDrawer() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

/** Re-render cart drawer contents from localStorage */
function renderCartDrawer() {
  const itemsEl  = document.getElementById('cart-items');
  const totalEl  = document.getElementById('cart-total');
  const countEl  = document.getElementById('cart-item-count');
  const checkBtn = document.getElementById('cart-checkout-btn');
  if (!itemsEl) return;

  const cart = getCart();

  if (countEl) countEl.textContent = `${cart.length} item${cart.length !== 1 ? 's' : ''}`;

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty-state">
        <span class="cart-empty-state__icon">🛒</span>
        <p class="cart-empty-state__text">Your cart is empty.<br>Add a product to get started.</p>
      </div>`;
    if (totalEl) totalEl.textContent = `${SITE_CONFIG.currencySymbol}0`;
    if (checkBtn) checkBtn.disabled = true;
    return;
  }

  if (checkBtn) checkBtn.disabled = false;

  itemsEl.innerHTML = cart.map(function(item) {
    return `
      <div class="cart-item">
        <img
          class="cart-item__img"
          src="${item.image_url}"
          alt="${item.name}"
          onerror="this.src=''; this.style.background='var(--color-primary-light)';"
        />
        <div class="cart-item__info">
          <div class="cart-item__name" title="${item.name}">${item.name}</div>
          <div class="cart-item__price">${SITE_CONFIG.currencySymbol}${Number(item.price).toLocaleString('en-IN')}</div>
          <div class="cart-item__qty">
            <button class="cart-item__qty-btn" onclick="updateQuantity('${item.id}', ${item.quantity - 1})" aria-label="Decrease quantity">−</button>
            <span class="cart-item__qty-num">${item.quantity}</span>
            <button class="cart-item__qty-btn" onclick="updateQuantity('${item.id}', ${item.quantity + 1})" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="cart-item__remove" onclick="removeFromCart('${item.id}')" aria-label="Remove ${item.name}">×</button>
      </div>`;
  }).join('');

  if (totalEl) {
    totalEl.textContent = `${SITE_CONFIG.currencySymbol}${getCartTotal().toLocaleString('en-IN')}`;
  }
}

/* ============================================================
   PRODUCT DETAIL NAVIGATION
   ============================================================ */
function openProductDetail(productId) {
  window.location.href = `product-detail.html?id=${productId}`;
}

/* ============================================================
   OFFLINE BANNER
   ============================================================ */
function showOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.add('show');
}

/* ============================================================
   DYNAMIC CATEGORY COUNTS
   Update counts in sidebar based on loaded products
   ============================================================ */
function updateCategoryCounts() {
  const counts = {
    all: allProducts.length,
    molecular_serums:     0,
    cellular_kits:        0,
    bio_devices:          0,
    advanced_supplements: 0
  };
  allProducts.forEach(function(p) {
    if (counts[p.category] !== undefined) counts[p.category]++;
  });

  document.querySelectorAll('.category-btn').forEach(function(btn) {
    const cat = btn.dataset.category;
    const countEl = btn.querySelector('.category-btn__count');
    if (countEl && counts[cat] !== undefined) {
      countEl.textContent = counts[cat];
    }
  });
}

/* ============================================================
   MAIN INIT
   ============================================================ */
async function initShop() {
  initSidebar();
  initCartDrawer();

  // Show 6 skeleton loaders while fetching
  showSkeletons(6);

  // Fetch from Supabase
  const products = await fetchProductsFromSupabase();

  if (products && products.length > 0) {
    allProducts = products;
  } else {
    // Supabase unreachable — use fallback
    allProducts = FALLBACK_PRODUCTS;
    isOffline   = true;
    showOfflineBanner();
  }

  updateCategoryCounts();
  applyFilters();

  // Trigger fade-up animation on newly rendered cards
  // (main.js IntersectionObserver handles .fade-up class)
  if (window.initFadeUp) window.initFadeUp();
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', initShop);

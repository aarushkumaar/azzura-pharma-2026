/* ============================================================
   AZZURRA PHARMACONUTRITION — CART UTILITIES
   Shared cart helpers used across all product pages.

   Provides:
     window.azzuraAddToCart(product, qty) — add / increment item
     window.updateCartBadge()             — refresh all navbar badge(s)
     window.getAzzurraCart()              — read cart array

   Cart is persisted in localStorage under 'azzurra_cart'
   (matching the key used in cart.html).

   IMPORTANT: Do NOT modify cart.html or checkout.html —
   this file provides the missing bridge between product pages
   and the existing cart/checkout system.
   ============================================================ */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'azzurra_cart';

  /* ── Read cart ─────────────────────────────────────────── */
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  /* ── Write cart ─────────────────────────────────────────── */
  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) { /* localStorage unavailable */ }
    updateCartBadge();
  }

  /* ── Update all navbar cart badge(s) on this page ─────── */
  function updateCartBadge() {
    var cart       = getCart();
    var totalItems = cart.reduce(function(n, item) {
      return n + (item.quantity || 1);
    }, 0);

    /* Update every element with class 'navbar__cart-badge'
       (covers both #navbar-cart-badge and any duplicates)   */
    var badges = document.querySelectorAll('.navbar__cart-badge');
    badges.forEach(function(badge) {
      badge.textContent = totalItems > 0 ? String(totalItems) : '0';
      badge.style.display = totalItems > 0 ? '' : '';
    });
  }

  /* ── Add to cart ─────────────────────────────────────────
     product: { id, name, price, image, series }
     qty:     number (default 1)
  ────────────────────────────────────────────────────────── */
  function addToCart(product, qty) {
    if (!product || !product.id) return;
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var cart    = getCart();
    var existing = cart.find(function(item) { return item.id === product.id; });

    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
    } else {
      cart.push({
        id:       product.id,
        name:     product.name     || '',
        price:    product.price    || 0,
        image:    product.image    || product.imagePath || (product.images && product.images[0]) || '',
        series:   product.series   || '',
        quantity: qty
      });
    }

    saveCart(cart);

    /* Flash the cart icon for visual feedback */
    var icons = document.querySelectorAll('.navbar__cart-icon');
    icons.forEach(function(icon) {
      icon.style.transform = 'scale(1.25)';
      setTimeout(function() { icon.style.transform = ''; }, 300);
    });
  }

  /* ── Expose on window ──────────────────────────────────── */
  global.getAzzurraCart   = getCart;
  global.azzuraAddToCart  = addToCart;
  global.updateCartBadge  = updateCartBadge;

  /* ── Auto-update badge on page load ─────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCartBadge);
  } else {
    updateCartBadge();
  }

}(window));

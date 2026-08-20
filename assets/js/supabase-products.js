/* ============================================================
   AZZURRA — Supabase product loader (v2)
   Fetches products from the Supabase `products` table.
   Maps Supabase rows to the shape that shop.js expects.
   Falls back to static products-data.js on any error.

   Supabase column: images = JSON-stringified array of Cloudinary URLs
   e.g. '["https://res.cloudinary.com/.../img1.webp", ...]'
   ============================================================ */
'use strict';

(function () {
  var SUPABASE_URL      = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

  /* -- Helpers -- */

  /** Create a URL slug from any string */
  function slugify(text) {
    return String(text || 'product')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'product';
  }

  /** Parse a comma-separated string or array into a trimmed string array */
  function parseTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function(t) { return String(t).trim(); }).filter(Boolean);
    return String(raw).split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  /**
   * Parse the images JSON column into an array of URL strings.
   * Supabase stores it as a JSON-stringified array:
   *   '["https://res.cloudinary.com/.../img1.webp", "https://..."]'
   * Returns [] if parsing fails.
   */
  function parseImagesJson(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw; // already parsed (shouldn't happen via REST)
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [String(arr)];
    } catch (_) {
      // Might be a plain URL string (legacy single image)
      if (typeof raw === 'string' && raw.startsWith('http')) return [raw];
      return [];
    }
  }

  /**
   * Map a single Supabase `products` row to the shape that
   * shop.js uses internally for display and cart operations.
   *
   * Supabase schema:
   *   id, name, series, flavour, price_inr, short_description,
   *   tags, benefits, ingredients, how_to_use, nutrition_facts,
   *   warnings, image_folder, images (JSON), in_stock, is_featured,
   *   created_at
   */
  function mapSupabaseProduct(row) {
    var images   = parseImagesJson(row.images);
    var firstImg = images[0] || '';
    var series   = row.series || 'Others';

    // Derive a stable slug-based ID from the numeric Supabase ID or name
    var id = row.id ? String(row.id) : slugify(row.name);

    return {
      id:              id,
      _supabaseId:     row.id,           // keep numeric Supabase PK for updates

      /* Display fields */
      name:            row.name || 'Unnamed Product',
      series:          series,
      flavour:         row.flavour || '',
      description:     row.short_description || '',
      short_description: row.short_description || '',
      tags:            parseTags(row.tags),
      need_tags:       parseTags(row.tags),  // alias for shop.js filter
      benefits:        row.benefits || '',
      ingredients:     row.ingredients || '',
      how_to_use:      row.how_to_use || '',
      nutrition_facts: row.nutrition_facts || '',
      warnings:        row.warnings || '',

      /* Pricing */
      price:           Number(row.price_inr) || 0,
      price_inr:       Number(row.price_inr) || 0,
      compare_price:   null,   // not in schema; set to null so no compare badge

      /* Images — shop.js reads `image_url` for the card */
      image_url:       firstImg,          // primary image URL (Cloudinary)
      images:          images,            // all images array for gallery
      image_folder:    row.image_folder || '',

      /* Status */
      inStock:         row.in_stock !== false,
      in_stock:        row.in_stock !== false,
      is_featured:     !!row.is_featured,
      is_new_release:  false,

      /* Synthetic fields for shop.js compat */
      category:        slugify(series),   // used by sidebar category filter
      rating:          0,
      review_count:    0,
      stock_quantity:  row.in_stock ? 99 : 0,

      /* Detail page link — numeric ID in query string */
      detailPage:      'product-detail.html?id=' + encodeURIComponent(id),
    };
  }

  /**
   * Load all in-stock products from Supabase, sorted by
   * featured first then name ascending.
   *
   * Sets window.PRODUCTS to the mapped array and returns true on
   * success, false on failure (caller falls back to static data).
   */
  window.loadProductsFromSupabase = function () {
    var url = SUPABASE_URL +
      '/rest/v1/products' +
      '?select=*' +
      '&order=is_featured.desc,name.asc';

    return fetch(url, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Accept':        'application/json',
      },
      cache:  'no-store',
      signal: AbortSignal.timeout(8000),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Supabase HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        if (!rows || !rows.length) return false;
        window.PRODUCTS = rows.map(mapSupabaseProduct);
        window.__PRODUCTS_SOURCE = 'supabase';
        console.info('[Azzurra] Products loaded from Supabase (' + rows.length + ')');
        return true;
      })
      .catch(function (err) {
        console.warn('[Azzurra] Supabase unavailable, using static fallback:', err.message);
        window.__PRODUCTS_SOURCE = 'static';
        return false;
      });
  };

  /**
   * Load featured products only (for the homepage).
   * Returns array of mapped products or [] on failure.
   */
  window.loadFeaturedProductsFromSupabase = function (limit) {
    var n   = limit || 6;
    var url = SUPABASE_URL +
      '/rest/v1/products' +
      '?select=*' +
      '&is_featured=eq.true' +
      '&order=name.asc' +
      '&limit=' + n;

    return fetch(url, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Accept':        'application/json',
      },
      cache:  'no-store',
      signal: AbortSignal.timeout(6000),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Supabase HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        return (rows || []).map(mapSupabaseProduct);
      })
      .catch(function (err) {
        console.warn('[Azzurra] Featured products fetch failed:', err.message);
        return [];
      });
  };

  /**
   * Save an order to the Supabase `orders` table.
   * Called by checkout.js after form validation.
   *
   * @param {Object} orderPayload — { customer_name, customer_email, customer_phone,
   *                                  items (JSON string), total_amount, address }
   * @returns {Promise<Object>} — inserted row or throws on error
   */
  window.saveOrderToSupabase = function (orderPayload) {
    var url = SUPABASE_URL + '/rest/v1/orders';

    return fetch(url, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Prefer':        'return=representation',  // return inserted row
      },
      body: JSON.stringify({
        customer_name:  orderPayload.customer_name,
        customer_email: orderPayload.customer_email,
        customer_phone: orderPayload.customer_phone,
        items:          typeof orderPayload.items === 'string'
                          ? orderPayload.items
                          : JSON.stringify(orderPayload.items),
        total_amount:   orderPayload.total_amount,
        address:        orderPayload.address,
        status:         'pending',
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Order save failed: HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // Supabase returns an array for POST with Prefer:return=representation
        return Array.isArray(data) ? data[0] : data;
      });
  };

  /**
   * Upsert a customer record in the `customers` table.
   * Called from cart interactions and checkout.
   * Non-blocking — failures are swallowed silently.
   *
   * @param {Object} info — { name, email, phone, cart_activity }
   */
  window.upsertCustomerInSupabase = function (info) {
    if (!info || !info.email) return;

    var url = SUPABASE_URL + '/rest/v1/customers';

    fetch(url, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Prefer':        'resolution=merge-duplicates',  // upsert on email
      },
      body: JSON.stringify({
        name:          info.name  || '',
        email:         info.email,
        phone:         info.phone || '',
        last_activity: new Date().toISOString(),
        cart_activity: typeof info.cart_activity === 'string'
                         ? info.cart_activity
                         : JSON.stringify(info.cart_activity || []),
      }),
    }).catch(function () { /* non-critical, swallow silently */ });
  };

  /**
   * Submit a "Notify Me" request for an out-of-stock product.
   * @param {number|string} productId  — Supabase product ID
   * @param {string}        productName — product display name
   * @param {string}        email       — customer email
   * @returns {Promise<boolean>}
   */
  window.submitNotifyMe = function (productId, productName, email) {
    var url = SUPABASE_URL + '/rest/v1/notify_me_requests';
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        product_id:   Number(productId),
        product_name: productName || '',
        email:        email,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return true;
      })
      .catch(function (err) {
        console.warn('[Azzurra] Notify Me submission failed:', err.message);
        return false;
      });
  };

})();

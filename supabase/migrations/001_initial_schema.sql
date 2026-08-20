-- ============================================================
-- AZZURRA PHARMACONUTRITION — SUPABASE DATABASE SCHEMA
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE product_category AS ENUM (
  'molecular_serums',
  'cellular_kits',
  'bio_devices',
  'advanced_supplements'
);

CREATE TYPE product_need AS ENUM (
  'longevity', 'cognition', 'recovery', 'radiance'
);

CREATE TYPE order_status AS ENUM (
  'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
);

CREATE TYPE payment_gateway AS ENUM ('razorpay', 'stripe');

CREATE TYPE payment_status AS ENUM (
  'initiated', 'success', 'failed', 'refunded'
);

CREATE TYPE admin_role AS ENUM ('superadmin', 'manager');

-- ============================================================
-- TABLE: products
-- All products shown in the shop. image_url is a relative path
-- to a local asset file (e.g. ./assets/images/luminary-serum.jpg)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id               BIGSERIAL     PRIMARY KEY,
  name             TEXT          NOT NULL,
  category         product_category NOT NULL,
  -- Array of need tags: can have multiple e.g. {'longevity','recovery'}
  need_tags        TEXT[]        NOT NULL DEFAULT '{}',
  price            NUMERIC(10,2) NOT NULL,
  compare_price    NUMERIC(10,2),          -- Original/crossed-out price
  rating           NUMERIC(2,1)  NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
  review_count     INTEGER       NOT NULL DEFAULT 0,
  description      TEXT          NOT NULL DEFAULT '',
  is_new_release   BOOLEAN       NOT NULL DEFAULT FALSE,
  is_featured      BOOLEAN       NOT NULL DEFAULT FALSE,
  stock_quantity   INTEGER       NOT NULL DEFAULT 0,
  -- Relative path to local image file: ./assets/images/product-slug.jpg
  image_url        TEXT          NOT NULL DEFAULT './assets/images/placeholder.jpg',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: customers
-- id matches auth.uid() from Supabase Auth so RLS can filter by user
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Email used for identification
  email               TEXT          NOT NULL UNIQUE,
  full_name           TEXT,
  phone               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Updated by a trigger when orders are completed
  total_lifetime_value NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

-- ============================================================
-- TABLE: orders
-- One row per checkout attempt. shipping_address stored as JSONB.
-- payment_intent_id holds the Razorpay/Stripe order/intent ID.
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID         REFERENCES customers(id) ON DELETE SET NULL,
  status             order_status NOT NULL DEFAULT 'pending',
  total_amount       NUMERIC(12,2) NOT NULL,
  payment_intent_id  TEXT,        -- Razorpay order_id or Stripe payment_intent_id
  -- JSON: { name, address_line1, city, state, pincode, phone }
  shipping_address   JSONB        NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any order row change
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();

-- ============================================================
-- TABLE: order_items
-- Line items for each order. unit_price captures price at purchase time
-- (important: product price may change later).
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   BIGINT        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL, -- Price at time of purchase
  subtotal     NUMERIC(12,2) NOT NULL  -- quantity * unit_price
);

-- ============================================================
-- TABLE: payments
-- One row per payment attempt (retries create new rows).
-- metadata stores raw gateway response (JSONB).
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID            NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway             payment_gateway NOT NULL,
  gateway_payment_id  TEXT,           -- Razorpay payment_id or Stripe charge_id
  amount              NUMERIC(12,2)   NOT NULL,
  currency            TEXT            NOT NULL DEFAULT 'INR',
  status              payment_status  NOT NULL DEFAULT 'initiated',
  -- Raw response from gateway stored for audit/debugging
  metadata            JSONB           NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: admin_users
-- Whitelist of emails allowed to access the admin dashboard.
-- id should match the Supabase Auth user ID of the admin.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id         UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT       NOT NULL UNIQUE,
  role       admin_role NOT NULL DEFAULT 'manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: site_settings
-- Key-value store for site-wide configuration.
-- value is JSONB to support any data type.
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT  PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'
);

-- Insert default settings
INSERT INTO site_settings (key, value) VALUES
  ('active_gateway',    '"razorpay"'),
  ('announcement',      '{"enabled": false, "text": "Free shipping on orders above ₹2000"}'),
  ('featured_product_ids', '[]')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings   ENABLE ROW LEVEL SECURITY;

-- ---- products ----
-- Anyone (anon + authenticated) can read products
CREATE POLICY "products_public_read"
  ON products FOR SELECT
  USING (true);

-- Only service role can insert/update/delete products (admin dashboard)
-- (service role bypasses RLS by default, no explicit policy needed)

-- ---- customers ----
-- Customers can only read/update their own row (matched by email in auth.jwt())
CREATE POLICY "customers_own_read"
  ON customers FOR SELECT
  USING (auth.jwt()->>'email' = email);

CREATE POLICY "customers_own_update"
  ON customers FOR UPDATE
  USING (auth.jwt()->>'email' = email);

-- Allow anon to insert a customer row (for guest checkout / first-time registration)
CREATE POLICY "customers_insert_anon"
  ON customers FOR INSERT
  WITH CHECK (true);

-- ---- orders ----
-- Authenticated users can create orders
CREATE POLICY "orders_insert_authenticated"
  ON orders FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'anon'));

-- Users can only view their own orders
CREATE POLICY "orders_own_select"
  ON orders FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE email = auth.jwt()->>'email'
    )
  );

-- ---- order_items ----
-- Users can insert items for their own orders
CREATE POLICY "order_items_insert"
  ON order_items FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "order_items_own_select"
  ON order_items FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.email = auth.jwt()->>'email'
    )
  );

-- ---- payments ----
-- Only the service role (Edge Functions) can insert payments
-- Public users can read their own payment records
CREATE POLICY "payments_own_select"
  ON payments FOR SELECT
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.email = auth.jwt()->>'email'
    )
  );

-- ---- admin_users ----
-- Only service role can access admin_users (no public policies)
-- The anon/authenticated roles cannot read this table at all

-- ---- site_settings ----
-- Public can read settings (for banners, active gateway, etc.)
CREATE POLICY "site_settings_public_read"
  ON site_settings FOR SELECT
  USING (true);

-- ============================================================
-- SEED DATA — sample products for development
-- Replace image_url values with actual local asset paths
-- ============================================================
INSERT INTO products (name, category, need_tags, price, compare_price, rating, review_count, description, is_new_release, is_featured, stock_quantity, image_url)
VALUES
  (
    'Luminary Molecular Serum', 'molecular_serums',
    ARRAY['longevity', 'radiance'], 4850.00, 5500.00, 4.8, 48,
    'Adaptive DNA repair complex with high-potency Vitamin C for cellular restoration. Formulated with liposomal delivery for maximum bioavailability.',
    TRUE, TRUE, 42, './assets/images/luminary-serum.jpg'
  ),
  (
    'CellSync Pulse Device', 'bio_devices',
    ARRAY['recovery', 'longevity'], 12999.00, 15000.00, 4.0, 124,
    'Non-invasive cellular resonance technology for rapid muscle recovery and ATP synthesis stimulation. Clinical-grade wearable.',
    FALSE, FALSE, 18, './assets/images/cellsync-device.jpg'
  ),
  (
    'Neuro-Prime Catalyst', 'advanced_supplements',
    ARRAY['cognition', 'longevity'], 3120.00, NULL, 5.0, 210,
    'Advanced nootropic complex formulated for cognitive clarity and sustained mental focus. Contains Lion''s Mane, CDP-Choline, and Bacopa Monnieri.',
    FALSE, TRUE, 65, './assets/images/neuro-prime.jpg'
  ),
  (
    'The Genesis System', 'cellular_kits',
    ARRAY['longevity', 'recovery', 'radiance'], 16900.00, 20000.00, 5.0, 56,
    'Complete 30-day biological reset kit with multi-stage serums, cellular kits, and supplements for total body rejuvenation.',
    FALSE, TRUE, 12, './assets/images/genesis-kit.jpg'
  ),
  (
    'Telomere Elixir', 'advanced_supplements',
    ARRAY['longevity', 'radiance'], 5590.00, NULL, 4.0, 34,
    'Liquid supplement targeting cellular aging markers through molecular delivery. Contains TA-65 and resveratrol complex.',
    FALSE, FALSE, 30, './assets/images/telomere-elixir.jpg'
  ),
  (
    'Azzurra Bio-Patch', 'bio_devices',
    ARRAY['recovery', 'cognition'], 2310.00, 2700.00, 5.0, 18,
    'Real-time nutrient absorption monitor with AI integration for personalised supplementation tracking.',
    TRUE, FALSE, 55, './assets/images/bio-patch.jpg'
  ),
  (
    'Radiance Cellular Kit', 'cellular_kits',
    ARRAY['radiance', 'longevity'], 8750.00, 9500.00, 4.5, 87,
    'Complete cellular skincare and supplementation kit targeting oxidative stress for visible radiance improvement.',
    FALSE, FALSE, 28, './assets/images/radiance-kit.jpg'
  ),
  (
    'OmegaCore Vital', 'advanced_supplements',
    ARRAY['recovery', 'cognition'], 1850.00, NULL, 4.7, 156,
    'Ultra-pure omega-3 complex with phospholipid-bound DHA for superior neural membrane support.',
    FALSE, FALSE, 80, './assets/images/omegacore.jpg'
  )
ON CONFLICT DO NOTHING;

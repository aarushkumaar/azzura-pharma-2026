-- ============================================================
-- AZZURRA — Complete table reset
-- Copy-paste this ENTIRE block into Supabase SQL Editor → Run
-- Safe to run multiple times (DROPs are CASCADE).
-- ============================================================

-- ── 1. DROP EVERYTHING ──────────────────────────────────────
DROP TABLE IF EXISTS public.payments     CASCADE;
DROP TABLE IF EXISTS public.order_items  CASCADE;
DROP TABLE IF EXISTS public.orders       CASCADE;
DROP TABLE IF EXISTS public.products     CASCADE;
DROP TABLE IF EXISTS public.customers    CASCADE;
DROP TABLE IF EXISTS public.settings     CASCADE;
DROP TABLE IF EXISTS public.site_settings CASCADE;
DROP TABLE IF EXISTS public.admin_users  CASCADE;

-- ── 2. RECREATE TABLES ──────────────────────────────────────

-- products
CREATE TABLE public.products (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  series           TEXT DEFAULT '',
  flavour          TEXT DEFAULT '',
  price_inr        NUMERIC(10,2) DEFAULT 0,
  short_description TEXT DEFAULT '',
  tags             TEXT DEFAULT '',
  benefits         TEXT DEFAULT '',
  ingredients      TEXT DEFAULT '',
  how_to_use       TEXT DEFAULT '',
  nutrition_facts  TEXT DEFAULT '',
  warnings         TEXT DEFAULT '',
  image_folder     TEXT DEFAULT '',
  images           TEXT DEFAULT '[]',
  in_stock         BOOLEAN NOT NULL DEFAULT true,
  is_featured      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- orders
CREATE TABLE public.orders (
  id               BIGSERIAL PRIMARY KEY,
  customer_name    TEXT NOT NULL DEFAULT '',
  customer_email   TEXT DEFAULT '',
  customer_phone   TEXT DEFAULT '',
  items            TEXT DEFAULT '[]',
  total_amount     NUMERIC(10,2) DEFAULT 0,
  status           TEXT DEFAULT 'pending',
  address          TEXT DEFAULT '',
  notes            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- customers
CREATE TABLE public.customers (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT DEFAULT '',
  email            TEXT UNIQUE,
  phone            TEXT DEFAULT '',
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_orders     INTEGER DEFAULT 0,
  cart_activity    TEXT DEFAULT ''
);

-- settings (key/value)
CREATE TABLE public.settings (
  id               BIGSERIAL PRIMARY KEY,
  key              TEXT UNIQUE NOT NULL,
  value            TEXT DEFAULT '',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. SEED DEFAULT SETTINGS ────────────────────────────────
INSERT INTO public.settings (key, value) VALUES
  ('site_name',     'Azzurra'),
  ('contact_phone', '+91 98 71 648 649'),
  ('contact_email', 'info@azzurrapharmaconutrition.com')
ON CONFLICT (key) DO NOTHING;

-- ── 4. ENABLE ROW LEVEL SECURITY ────────────────────────────
ALTER TABLE public.products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings  ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS POLICIES ─────────────────────────────────────────

-- products
DROP POLICY IF EXISTS "products_public_read" ON public.products;
DROP POLICY IF EXISTS "products_auth_write"  ON public.products;

CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  TO public USING (true);

CREATE POLICY "products_auth_write"
  ON public.products FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- orders
DROP POLICY IF EXISTS "orders_anyone_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_auth_all"      ON public.orders;

CREATE POLICY "orders_anyone_insert"
  ON public.orders FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "orders_auth_all"
  ON public.orders FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "customers_anyone_upsert" ON public.customers;
DROP POLICY IF EXISTS "customers_anyone_update" ON public.customers;
DROP POLICY IF EXISTS "customers_auth_read"     ON public.customers;

CREATE POLICY "customers_anyone_upsert"
  ON public.customers FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "customers_anyone_update"
  ON public.customers FOR UPDATE
  TO public USING (true);

CREATE POLICY "customers_auth_read"
  ON public.customers FOR SELECT
  TO authenticated USING (true);

-- settings
DROP POLICY IF EXISTS "settings_public_read" ON public.settings;
DROP POLICY IF EXISTS "settings_auth_write"  ON public.settings;

CREATE POLICY "settings_public_read"
  ON public.settings FOR SELECT
  TO public USING (true);

CREATE POLICY "settings_auth_write"
  ON public.settings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── DONE ─────────────────────────────────────────────────────
-- Next steps:
-- 1. Go to Authentication → Users in the Supabase dashboard
-- 2. Confirm aarushk0207@gmail.com exists (password: AarushLovesfood)
--    If not: Authentication → Users → Invite → set password manually
-- 3. Run: npx serve . in the project root
-- 4. Open http://localhost:3000/admin-login.html

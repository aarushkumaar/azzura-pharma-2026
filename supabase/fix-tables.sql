-- ============================================================
-- AZZURRA — Products + Orders table complete reset
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- This drops the old wrong-schema tables and recreates them.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║  PRODUCTS TABLE                                          ║
-- ╚══════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.products CASCADE;

CREATE TABLE public.products (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  series           TEXT,
  flavour          TEXT,
  price_inr        NUMERIC(10,2) DEFAULT 0,
  short_description TEXT,
  tags             TEXT,
  benefits         TEXT,
  ingredients      TEXT,
  how_to_use       TEXT,
  nutrition_facts  TEXT,
  warnings         TEXT,
  image_folder     TEXT,
  images           TEXT,
  in_stock         BOOLEAN NOT NULL DEFAULT true,
  is_featured      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone can read products (needed by shop page)
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

-- Only authenticated admin can write
CREATE POLICY "products_auth_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "products_auth_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "products_auth_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (true);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  ORDERS TABLE                                            ║
-- ╚══════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.orders CASCADE;

CREATE TABLE public.orders (
  id               BIGSERIAL PRIMARY KEY,
  customer_name    TEXT,
  customer_email   TEXT,
  customer_phone   TEXT,
  items            TEXT,
  total_amount     NUMERIC(10,2) DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  address          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone (checkout) can INSERT an order
CREATE POLICY "orders_public_insert"
  ON public.orders FOR INSERT
  WITH CHECK (true);

-- Only authenticated admin can read/update/delete
CREATE POLICY "orders_auth_read"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "orders_auth_update"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "orders_auth_delete"
  ON public.orders FOR DELETE
  TO authenticated
  USING (true);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  CUSTOMERS TABLE (recreate if wrong schema)              ║
-- ╚══════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.customers CASCADE;

CREATE TABLE public.customers (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT,
  email         TEXT UNIQUE,
  phone         TEXT,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_orders  INTEGER DEFAULT 0,
  cart_activity TEXT
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_public_insert"
  ON public.customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "customers_public_update"
  ON public.customers FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "customers_auth_read"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "customers_auth_delete"
  ON public.customers FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- Done. Next steps:
-- 1. Go to Authentication → Users → confirm aarushk0207@gmail.com exists
-- 2. Run: npx serve . in the project root
-- 3. Open http://localhost:3000/admin-login.html → log in
-- 4. In Products section click "Import from Cloudinary"
-- ============================================================

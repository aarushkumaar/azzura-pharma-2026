-- ============================================================
-- AZZURRA PHARMACONUTRITION — Supabase Database Setup
-- Run this entire script in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- TABLE: products
-- Stores all product data. Public can read, only auth users write.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  series           TEXT,
  flavour          TEXT,
  price_inr        NUMERIC(10,2) DEFAULT 0,
  short_description TEXT,
  tags             TEXT,                   -- comma-separated e.g. "glutamine,recovery"
  benefits         TEXT,                   -- newline-separated list
  ingredients      TEXT,
  how_to_use       TEXT,
  nutrition_facts  TEXT,
  warnings         TEXT,
  image_folder     TEXT,                   -- e.g. "ESENTIAL_SERIES/ESSENTIAL_BLCD_CHOCOLATE_350"
  images           TEXT,                   -- JSON stringified array of Cloudinary URLs
  in_stock         BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: orders
-- Stores customer orders from checkout. Anyone can insert.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id               BIGSERIAL PRIMARY KEY,
  customer_name    TEXT,
  customer_email   TEXT,
  customer_phone   TEXT,
  items            TEXT,                   -- JSON stringified cart items array
  total_amount     NUMERIC(10,2) DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
                                          -- pending | confirmed | shipped | delivered | cancelled
  address          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: customers
-- Tracks visitors who browse or checkout. Anyone can upsert.
-- Unique on email to allow merge-duplicates upsert.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT,
  email            TEXT UNIQUE,           -- UNIQUE so we can upsert on email
  phone            TEXT,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_orders     NUMERIC DEFAULT 0,
  cart_activity    TEXT                   -- JSON stringified last cart state
);

-- ============================================================
-- TABLE: settings
-- Site-wide config. Public can read, only auth users can update.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id               INTEGER PRIMARY KEY DEFAULT 1,  -- always one row
  site_name        TEXT DEFAULT 'Azzurra',
  contact_phone    TEXT DEFAULT '+91 98 71 648 649',
  contact_email    TEXT DEFAULT 'info@azzurrapharmaconutrition.com'
);

-- Insert default settings row if not exists
INSERT INTO public.settings (id, site_name, contact_phone, contact_email)
VALUES (1, 'Azzurra', '+91 98 71 648 649', 'info@azzurrapharmaconutrition.com')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- ROW LEVEL SECURITY — Enable on all tables
-- ============================================================
ALTER TABLE public.products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- RLS POLICIES: products
-- ============================================================

-- Anyone (incl. unauthenticated public) can read all products.
-- This is required for the shop page and product detail pages.
CREATE POLICY "Products: public read"
  ON public.products
  FOR SELECT
  USING (true);

-- Only authenticated admin users can insert new products.
-- (via admin.html after signing in with Supabase Auth)
CREATE POLICY "Products: auth insert"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users can update products.
-- (toggle in_stock, is_featured, edit details)
CREATE POLICY "Products: auth update"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users can delete products.
CREATE POLICY "Products: auth delete"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- RLS POLICIES: orders
-- ============================================================

-- Anyone (public customers) can insert new orders.
-- This is required for checkout.js to save orders from the
-- frontend without requiring the customer to be logged in.
CREATE POLICY "Orders: public insert"
  ON public.orders
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated admin users can read all orders.
-- (admin.html orders section)
CREATE POLICY "Orders: auth read"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update order status.
-- (admin changes: pending → confirmed → shipped → delivered)
CREATE POLICY "Orders: auth update"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users can delete orders.
CREATE POLICY "Orders: auth delete"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- RLS POLICIES: customers
-- ============================================================

-- Anyone can insert customer records.
-- (shop.js calls upsertCustomerInSupabase when items are added to cart)
CREATE POLICY "Customers: public insert"
  ON public.customers
  FOR INSERT
  WITH CHECK (true);

-- Anyone can update a customer record (used for upsert on email).
-- The Prefer: resolution=merge-duplicates header uses this.
CREATE POLICY "Customers: public update"
  ON public.customers
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Only authenticated admin users can read the full customer list.
CREATE POLICY "Customers: auth read"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can delete customer records.
CREATE POLICY "Customers: auth delete"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================
-- RLS POLICIES: settings
-- ============================================================

-- Anyone can read settings (used for public site contact info).
CREATE POLICY "Settings: public read"
  ON public.settings
  FOR SELECT
  USING (true);

-- Only authenticated users can update settings.
CREATE POLICY "Settings: auth update"
  ON public.settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- DONE
-- After running this script:
-- 1. Go to Authentication → Users in Supabase dashboard
-- 2. Create user: aarushk0207@gmail.com / AarushLovesfood
-- 3. Visit admin-login.html in your browser to sign in
-- ============================================================

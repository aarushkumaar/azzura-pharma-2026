-- ============================================================
-- AZZURRA PHARMACONUTRITION — New Features Migration
-- Run this entire script in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- STEP 1: New columns on existing orders table
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method   TEXT NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS coupon_code      TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: customer_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  saved_cart    TEXT,
  wishlist      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: customer_addresses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT DEFAULT 'Home',
  full_name     TEXT,
  phone         TEXT,
  address_line  TEXT,
  city          TEXT,
  state         TEXT,
  pincode       TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: notify_me_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notify_me_requests (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name  TEXT,
  email         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: public.contact_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  subject       TEXT,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: coupons
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  discount_type   TEXT NOT NULL DEFAULT 'percentage',
  discount_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  usage_limit     INTEGER,
  used_count      INTEGER NOT NULL DEFAULT 0,
  per_customer    BOOLEAN NOT NULL DEFAULT FALSE,
  expiry_date     DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: coupon_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id             BIGSERIAL PRIMARY KEY,
  coupon_id      BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  coupon_code    TEXT NOT NULL,
  order_id       UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: homepage_banners
-- ============================================================
CREATE TABLE IF NOT EXISTS public.homepage_banners (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT,
  image_url       TEXT NOT NULL,
  link_url        TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.customer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notify_me_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_banners   ENABLE ROW LEVEL SECURITY;

-- customer_profiles policies
DROP POLICY IF EXISTS "customer_profiles: owner read" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner read"   ON public.customer_profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_profiles: owner insert" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner insert" ON public.customer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_profiles: owner update" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner update" ON public.customer_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_profiles: owner delete" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner delete" ON public.customer_profiles FOR DELETE USING (auth.uid() = user_id);

-- customer_addresses policies
DROP POLICY IF EXISTS "customer_addresses: owner read" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner read"   ON public.customer_addresses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_addresses: owner insert" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner insert" ON public.customer_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_addresses: owner update" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner update" ON public.customer_addresses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "customer_addresses: owner delete" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner delete" ON public.customer_addresses FOR DELETE USING (auth.uid() = user_id);

-- notify_me_requests policies
DROP POLICY IF EXISTS "notify_me: public insert" ON public.notify_me_requests;
CREATE POLICY "notify_me: public insert" ON public.notify_me_requests FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "notify_me: auth read" ON public.notify_me_requests;
CREATE POLICY "notify_me: auth read"     ON public.notify_me_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notify_me: auth delete" ON public.notify_me_requests;
CREATE POLICY "notify_me: auth delete"   ON public.notify_me_requests FOR DELETE TO authenticated USING (true);

-- contact_messages policies
DROP POLICY IF EXISTS "contact_messages: public insert" ON public.contact_messages;
CREATE POLICY "contact_messages: public insert" ON public.contact_messages FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "contact_messages: auth read" ON public.contact_messages;
CREATE POLICY "contact_messages: auth read"     ON public.contact_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contact_messages: auth update" ON public.contact_messages;
CREATE POLICY "contact_messages: auth update"   ON public.contact_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "contact_messages: auth delete" ON public.contact_messages;
CREATE POLICY "contact_messages: auth delete"   ON public.contact_messages FOR DELETE TO authenticated USING (true);

-- coupons policies
DROP POLICY IF EXISTS "coupons: public read" ON public.coupons;
CREATE POLICY "coupons: public read"  ON public.coupons FOR SELECT USING (true);
DROP POLICY IF EXISTS "coupons: auth insert" ON public.coupons;
CREATE POLICY "coupons: auth insert"  ON public.coupons FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "coupons: auth update" ON public.coupons;
CREATE POLICY "coupons: auth update"  ON public.coupons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "coupons: auth delete" ON public.coupons;
CREATE POLICY "coupons: auth delete"  ON public.coupons FOR DELETE TO authenticated USING (true);

-- coupon_usage policies
DROP POLICY IF EXISTS "coupon_usage: public insert" ON public.coupon_usage;
CREATE POLICY "coupon_usage: public insert" ON public.coupon_usage FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "coupon_usage: auth read" ON public.coupon_usage;
CREATE POLICY "coupon_usage: auth read"     ON public.coupon_usage FOR SELECT TO authenticated USING (true);

-- homepage_banners policies
DROP POLICY IF EXISTS "homepage_banners: public read" ON public.homepage_banners;
CREATE POLICY "homepage_banners: public read"  ON public.homepage_banners FOR SELECT USING (true);
DROP POLICY IF EXISTS "homepage_banners: auth insert" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth insert"  ON public.homepage_banners FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "homepage_banners: auth update" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth update"  ON public.homepage_banners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "homepage_banners: auth delete" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth delete"  ON public.homepage_banners FOR DELETE TO authenticated USING (true);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id  ON public.customer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_notify_me_product_id       ON public.notify_me_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status    ON public.contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_coupons_code               ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_id     ON public.coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_homepage_banners_order     ON public.homepage_banners(display_order);
CREATE INDEX IF NOT EXISTS idx_orders_customer_user_id    ON public.orders(customer_user_id);

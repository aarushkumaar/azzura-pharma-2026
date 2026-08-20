-- ============================================================
-- PHASE 1: CREATE MISSING INDEPENDENT TABLES & INDEXES
-- ============================================================

-- ---- admin_users ----
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT       NOT NULL UNIQUE,
  role       TEXT       NOT NULL DEFAULT 'manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- contact_messages ----
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

-- ---- homepage_banners ----
CREATE TABLE IF NOT EXISTS public.homepage_banners (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT,
  image_url       TEXT NOT NULL,
  link_url        TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- coupons ----
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
-- INDEXES FOR INDEPENDENT TABLES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_homepage_banners_order ON public.homepage_banners(display_order);

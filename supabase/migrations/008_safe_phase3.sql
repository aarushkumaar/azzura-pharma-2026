-- ============================================================
-- PHASE 3: CREATE FOREIGN-KEY-DEPENDENT TABLES & INDEXES
-- ============================================================

-- ---- order_items ----
CREATE TABLE IF NOT EXISTS public.order_items (
  id           BIGSERIAL     PRIMARY KEY,
  order_id     BIGINT        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id   BIGINT        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT,
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,
  total_price  NUMERIC(12,2),
  subtotal     NUMERIC(12,2),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---- payments ----
CREATE TABLE IF NOT EXISTS public.payments (
  id                  BIGSERIAL       PRIMARY KEY,
  order_id            BIGINT          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway             TEXT,
  gateway_payment_id  TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature  TEXT,
  amount              NUMERIC(12,2)   NOT NULL,
  currency            TEXT            NOT NULL DEFAULT 'INR',
  status              TEXT            NOT NULL DEFAULT 'initiated',
  metadata            JSONB           NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---- customer_profiles ----
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

-- ---- customer_addresses ----
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

-- ---- coupon_usage ----
CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id             BIGSERIAL PRIMARY KEY,
  coupon_id      BIGINT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  coupon_code    TEXT NOT NULL,
  order_id       BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR DEPENDENT TABLES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON public.coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id ON public.customer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);

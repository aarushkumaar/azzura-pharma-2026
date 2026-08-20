-- ============================================================
-- PHASE 2: ADD REQUIRED COLUMNS TO EXISTING TABLES
-- ============================================================

-- ---- products ----
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS compare_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1) DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT './assets/images/placeholder.jpg',
  ADD COLUMN IF NOT EXISTS net_weight TEXT,
  ADD COLUMN IF NOT EXISTS is_new_release BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;

-- Safe backfill synchronization of pricing fields
UPDATE public.products SET price = price_inr WHERE price IS NULL AND price_inr IS NOT NULL;
UPDATE public.products SET price_inr = price WHERE price_inr IS NULL AND price IS NOT NULL;

-- Safe backfill synchronization of stock_quantity based on existing in_stock state
UPDATE public.products
SET stock_quantity = CASE
    WHEN in_stock THEN 1
    ELSE 0
END
WHERE stock_quantity IS NULL OR stock_quantity = 0;

-- ---- customers ----
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS total_lifetime_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- orders ----
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shipping NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state TEXT,
  ADD COLUMN IF NOT EXISTS shipping_pincode TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

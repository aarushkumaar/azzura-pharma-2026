-- ============================================================
-- AZZURRA — SUPPLEMENTARY SQL
-- Run this in Supabase SQL Editor AFTER 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- RPC: increment_customer_ltv
-- Called by verifyPayment Edge Function after a successful payment
-- to keep customers.total_lifetime_value accurate.
-- ============================================================
CREATE OR REPLACE FUNCTION increment_customer_ltv(
  customer_id UUID,
  amount      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with owner privileges so RLS doesn't block it
AS $$
BEGIN
  UPDATE customers
  SET    total_lifetime_value = total_lifetime_value + amount
  WHERE  id = customer_id;
END;
$$;

-- Grant execute to the service role (Edge Functions)
GRANT EXECUTE ON FUNCTION increment_customer_ltv(UUID, NUMERIC) TO service_role;

-- ============================================================
-- INDEX: speed up common queries used by admin dashboard
-- ============================================================

-- Orders by created_at (date range queries in Overview)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- Orders by customer
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);

-- Orders by status (filter queries)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- Payments by order
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);

-- Payments by status
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- Products by category (shop filter)
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- Products by is_featured
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products (is_featured) WHERE is_featured = TRUE;

-- Products by is_new_release
CREATE INDEX IF NOT EXISTS idx_products_is_new_release ON products (is_new_release) WHERE is_new_release = TRUE;

-- ============================================================
-- HELPER VIEW: admin_order_summary
-- Joins orders + customers for the admin Orders table.
-- ============================================================
CREATE OR REPLACE VIEW admin_order_summary AS
SELECT
  o.id,
  o.created_at,
  o.total_amount,
  o.status,
  o.shipping_address,
  o.payment_intent_id,
  c.email        AS customer_email,
  c.full_name    AS customer_name,
  c.phone        AS customer_phone
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id;

-- Admin can read this view via service role (RLS bypassed)
-- Anon/authenticated users cannot access this view directly

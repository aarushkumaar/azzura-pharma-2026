-- ============================================================
-- PHASE 4: RLS POLICIES, FUNCTIONS, VIEWS, TRIGGERS & INDEXES
-- ============================================================

-- ============================================================
-- 1. VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.admin_order_summary AS
SELECT
  o.id,
  o.created_at,
  o.total_amount,
  o.status,
  o.address        AS shipping_address,
  o.id::text       AS payment_intent_id,
  o.customer_email AS customer_email,
  o.customer_name  AS customer_name,
  o.customer_phone AS customer_phone
FROM public.orders o;

-- ============================================================
-- 2. FUNCTIONS & TRIGGERS
-- ============================================================

-- ---- increment_customer_ltv ----
CREATE OR REPLACE FUNCTION public.increment_customer_ltv(
  customer_id BIGINT,
  amount      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.customers
  SET    total_lifetime_value = total_lifetime_value + amount
  WHERE  id = customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_ltv(BIGINT, NUMERIC) TO service_role;

-- ---- sync_product_stock ----
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity) OR TG_OP = 'INSERT' THEN
    NEW.in_stock = (NEW.stock_quantity > 0);
  ELSIF (TG_OP = 'UPDATE' AND OLD.in_stock IS DISTINCT FROM NEW.in_stock) THEN
    IF NEW.in_stock = FALSE THEN
      NEW.stock_quantity = 0;
    ELSIF NEW.stock_quantity = 0 THEN
      NEW.stock_quantity = 1; -- Placeholder value
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_product_stock ON public.products;
CREATE TRIGGER trigger_sync_product_stock
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- ---- update_orders_updated_at ----
CREATE OR REPLACE FUNCTION public.update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at_trigger ON public.orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_orders_updated_at();

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notify_me_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_banners   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES (Drop and Recreate)
-- ============================================================

-- ---- products ----
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "products_admin_insert" ON public.products;
CREATE POLICY "products_admin_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "products_admin_update" ON public.products;
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "products_admin_delete" ON public.products;
CREATE POLICY "products_admin_delete" ON public.products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email'));

-- ---- customers ----
DROP POLICY IF EXISTS "customers_own_read" ON public.customers;
CREATE POLICY "customers_own_read" ON public.customers FOR SELECT TO authenticated USING (auth.jwt()->>'email' = email);

DROP POLICY IF EXISTS "customers_own_update" ON public.customers;
CREATE POLICY "customers_own_update" ON public.customers FOR UPDATE TO authenticated USING (auth.jwt()->>'email' = email);

DROP POLICY IF EXISTS "customers_insert_anon" ON public.customers;
CREATE POLICY "customers_insert_anon" ON public.customers FOR INSERT TO authenticated, anon WITH CHECK (true);

-- ---- orders ----
DROP POLICY IF EXISTS "orders_insert_authenticated" ON public.orders;
CREATE POLICY "orders_insert_authenticated" ON public.orders FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "orders_own_select" ON public.orders;
CREATE POLICY "orders_own_select" ON public.orders FOR SELECT TO authenticated USING (customer_email = auth.jwt()->>'email');

-- ---- order_items ----
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_own_select" ON public.order_items;
CREATE POLICY "order_items_own_select" ON public.order_items FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE customer_email = auth.jwt()->>'email'));

-- ---- payments ----
DROP POLICY IF EXISTS "payments_own_select" ON public.payments;
CREATE POLICY "payments_own_select" ON public.payments FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE customer_email = auth.jwt()->>'email'));

-- ---- admin_users ----
DROP POLICY IF EXISTS "admin_users_self_read" ON public.admin_users;
CREATE POLICY "admin_users_self_read" ON public.admin_users FOR SELECT TO authenticated
  USING (email = auth.jwt() ->> 'email');

-- ---- settings ----
DROP POLICY IF EXISTS "settings_public_read" ON public.settings;
CREATE POLICY "settings_public_read" ON public.settings FOR SELECT USING (true);

-- ---- customer_profiles ----
DROP POLICY IF EXISTS "customer_profiles: owner read" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner read" ON public.customer_profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_profiles: owner insert" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner insert" ON public.customer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_profiles: owner update" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner update" ON public.customer_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_profiles: owner delete" ON public.customer_profiles;
CREATE POLICY "customer_profiles: owner delete" ON public.customer_profiles FOR DELETE USING (auth.uid() = user_id);

-- ---- customer_addresses ----
DROP POLICY IF EXISTS "customer_addresses: owner read" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner read" ON public.customer_addresses FOR SELECT USING (auth.uid() = user_id);

-- ---- customer_addresses ----
DROP POLICY IF EXISTS "customer_addresses: owner insert" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner insert" ON public.customer_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_addresses: owner update" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner update" ON public.customer_addresses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer_addresses: owner delete" ON public.customer_addresses;
CREATE POLICY "customer_addresses: owner delete" ON public.customer_addresses FOR DELETE USING (auth.uid() = user_id);

-- ---- notify_me_requests ----
DROP POLICY IF EXISTS "notify_me: public insert" ON public.notify_me_requests;
CREATE POLICY "notify_me: public insert" ON public.notify_me_requests FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "notify_me: auth read" ON public.notify_me_requests;
CREATE POLICY "notify_me: auth read" ON public.notify_me_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "notify_me: auth delete" ON public.notify_me_requests;
CREATE POLICY "notify_me: auth delete" ON public.notify_me_requests FOR DELETE TO authenticated USING (true);

-- ---- contact_messages ----
DROP POLICY IF EXISTS "contact_messages: public insert" ON public.contact_messages;
CREATE POLICY "contact_messages: public insert" ON public.contact_messages FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages: auth read" ON public.contact_messages;
CREATE POLICY "contact_messages: auth read" ON public.contact_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "contact_messages: auth update" ON public.contact_messages;
CREATE POLICY "contact_messages: auth update" ON public.contact_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages: auth delete" ON public.contact_messages;
CREATE POLICY "contact_messages: auth delete" ON public.contact_messages FOR DELETE TO authenticated USING (true);

-- ---- coupons ----
DROP POLICY IF EXISTS "coupons: public read" ON public.coupons;
CREATE POLICY "coupons: public read" ON public.coupons FOR SELECT USING (true);

DROP POLICY IF EXISTS "coupons: auth insert" ON public.coupons;
CREATE POLICY "coupons: auth insert" ON public.coupons FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "coupons: auth update" ON public.coupons;
CREATE POLICY "coupons: auth update" ON public.coupons FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "coupons: auth delete" ON public.coupons;
CREATE POLICY "coupons: auth delete" ON public.coupons FOR DELETE TO authenticated USING (true);

-- ---- coupon_usage ----
DROP POLICY IF EXISTS "coupon_usage: public insert" ON public.coupon_usage;
CREATE POLICY "coupon_usage: public insert" ON public.coupon_usage FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "coupon_usage: auth read" ON public.coupon_usage;
CREATE POLICY "coupon_usage: auth read" ON public.coupon_usage FOR SELECT TO authenticated USING (true);

-- ---- homepage_banners ----
DROP POLICY IF EXISTS "homepage_banners: public read" ON public.homepage_banners;
CREATE POLICY "homepage_banners: public read" ON public.homepage_banners FOR SELECT USING (true);

DROP POLICY IF EXISTS "homepage_banners: auth insert" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth insert" ON public.homepage_banners FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "homepage_banners: auth update" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth update" ON public.homepage_banners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "homepage_banners: auth delete" ON public.homepage_banners;
CREATE POLICY "homepage_banners: auth delete" ON public.homepage_banners FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 5. INDEXES FOR EXISTING TABLES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products (is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_is_new_release ON public.products (is_new_release) WHERE is_new_release = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_series ON public.products (series);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON public.products (in_stock) WHERE in_stock = TRUE;
CREATE INDEX IF NOT EXISTS idx_notify_me_product_id ON public.notify_me_requests (product_id);

-- ============================================================
-- 6. SAFE SEEDS
-- ============================================================
INSERT INTO public.admin_users (email, role)
VALUES ('m.pragya119@gmail.com', 'superadmin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.admin_users (email, role)
VALUES ('aarushk0207@gmail.com', 'superadmin')
ON CONFLICT (email) DO NOTHING;

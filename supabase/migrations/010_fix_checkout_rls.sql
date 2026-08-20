-- ============================================================
-- PHASE 5: Fix Checkout RLS Policies
-- Ensures secure order creation and reading for authenticated users.
-- ============================================================

-- 1. ORDERS TABLE POLICIES

-- Drop existing overlapping/incorrect policies
DROP POLICY IF EXISTS "orders_insert_authenticated" ON public.orders;
DROP POLICY IF EXISTS "orders_own_select" ON public.orders;

-- Allow authenticated users to insert orders ONLY if it belongs to their ID
CREATE POLICY "orders_insert_authenticated" ON public.orders 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = customer_user_id);

-- Allow authenticated users to view only their own orders
CREATE POLICY "orders_own_select" ON public.orders 
FOR SELECT TO authenticated 
USING (auth.uid() = customer_user_id);

-- Allow admins to see/modify all orders (optional, if you have an admin role)
-- CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated USING (auth.jwt()->>'role' = 'admin');


-- 2. ORDER ITEMS TABLE POLICIES

-- Drop existing order_items policies
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_own_select" ON public.order_items;

-- Users can insert items only into their own orders
CREATE POLICY "order_items_insert" ON public.order_items 
FOR INSERT TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM public.orders WHERE customer_user_id = auth.uid()
  )
);

-- Users can read items only from their own orders
CREATE POLICY "order_items_own_select" ON public.order_items 
FOR SELECT TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.orders WHERE customer_user_id = auth.uid()
  )
);

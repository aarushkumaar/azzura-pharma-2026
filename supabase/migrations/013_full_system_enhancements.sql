-- =================================================================================
-- 013_full_system_enhancements.sql
-- 1. Creates admin_email_recipients table for central admin email notification management.
-- 2. Creates email_logs table for email delivery activity tracking, audit, and retry/resend.
-- 3. Adds courier, tracking_number, and internal_notes to public.orders.
-- 4. Adds welcome_email_sent and internal_notes to public.customers.
-- 5. Adds priority and internal_notes to public.contact_messages.
-- 6. Configures robust Row Level Security (RLS) policies for all features.
-- Safe and idempotent to run on existing Supabase database.
-- =================================================================================

-- ── 1. ADMIN EMAIL RECIPIENTS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_email_recipients (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on admin_email_recipients
CREATE OR REPLACE FUNCTION public.update_admin_email_recipients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admin_email_recipients_updated_at ON public.admin_email_recipients;
CREATE TRIGGER trigger_admin_email_recipients_updated_at
  BEFORE UPDATE ON public.admin_email_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_admin_email_recipients_updated_at();

-- Seed initial admin email recipients if empty
INSERT INTO public.admin_email_recipients (email, is_enabled)
VALUES
  ('info@azzurrapharmaconutrition.com', true),
  ('Azzurrapharma@gmail.com', true)
ON CONFLICT (email) DO NOTHING;

-- RLS for admin_email_recipients
ALTER TABLE public.admin_email_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_email_recipients: admin all" ON public.admin_email_recipients;
CREATE POLICY "admin_email_recipients: admin all"
  ON public.admin_email_recipients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_email_recipients: service select" ON public.admin_email_recipients;
CREATE POLICY "admin_email_recipients: service select"
  ON public.admin_email_recipients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 2. EMAIL LOGS TABLE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_logs (
  id                  BIGSERIAL PRIMARY KEY,
  recipient           TEXT NOT NULL,
  email_type          TEXT NOT NULL,
  related_order_id    BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id         BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'sent', -- 'sent' or 'failed'
  resend_message_id   TEXT,
  error_message       TEXT,
  payload             JSONB DEFAULT '{}'::jsonb,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_related_order_id ON public.email_logs(related_order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON public.email_logs(email_type);

-- RLS for email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs: admin all" ON public.email_logs;
CREATE POLICY "email_logs: admin all"
  ON public.email_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_logs: service all" ON public.email_logs;
CREATE POLICY "email_logs: service all"
  ON public.email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 3. COLUMNS ON public.orders ──────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Policy to ensure authenticated admin can update orders fully
DROP POLICY IF EXISTS "orders: admin update all" ON public.orders;
CREATE POLICY "orders: admin update all"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders: admin select all" ON public.orders;
CREATE POLICY "orders: admin select all"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (true);


-- ── 4. COLUMNS ON public.customers ───────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Policy for admin to manage customers
DROP POLICY IF EXISTS "customers: admin all" ON public.customers;
CREATE POLICY "customers: admin all"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── 5. COLUMNS ON public.contact_messages ───────────────────────────────────────
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Policies for contact_messages
DROP POLICY IF EXISTS "contact_messages: admin all" ON public.contact_messages;
CREATE POLICY "contact_messages: admin all"
  ON public.contact_messages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── 6. ENSURE FULL ADMIN ACCESS ON COUPONS & NOTIFY ME ───────────────────────────
DROP POLICY IF EXISTS "coupons: admin all" ON public.coupons;
CREATE POLICY "coupons: admin all"
  ON public.coupons
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "notify_me: admin all" ON public.notify_me_requests;
CREATE POLICY "notify_me: admin all"
  ON public.notify_me_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =================================================================================
-- 014_events_and_orders_enhancements.sql
-- 1. Adds display_order and venue to public.events.
-- 2. Adds tracking_url to public.orders.
-- 3. Robust RLS policies for events, banners, and email_logs.
-- =================================================================================

-- ── 1. ENHANCE public.events ─────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue TEXT;

CREATE INDEX IF NOT EXISTS idx_events_display_order ON public.events(display_order);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON public.events(is_active);
CREATE INDEX IF NOT EXISTS idx_events_is_featured ON public.events(is_featured);

-- RLS for public.events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events: public read" ON public.events;
CREATE POLICY "events: public read"
  ON public.events
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "events: admin all" ON public.events;
CREATE POLICY "events: admin all"
  ON public.events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "events: service all" ON public.events;
CREATE POLICY "events: service all"
  ON public.events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 2. ENHANCE public.orders ─────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT;


-- ── 3. ENHANCE public.homepage_banners RLS ───────────────────────────────────────
ALTER TABLE public.homepage_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homepage_banners: public read" ON public.homepage_banners;
CREATE POLICY "homepage_banners: public read"
  ON public.homepage_banners
  FOR SELECT
  TO anon, authenticated
  USING (is_enabled = true);

DROP POLICY IF EXISTS "homepage_banners: admin all" ON public.homepage_banners;
CREATE POLICY "homepage_banners: admin all"
  ON public.homepage_banners
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "homepage_banners: service all" ON public.homepage_banners;
CREATE POLICY "homepage_banners: service all"
  ON public.homepage_banners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ── 4. ENHANCE public.email_logs RLS ─────────────────────────────────────────────
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs: anon insert" ON public.email_logs;
CREATE POLICY "email_logs: anon insert"
  ON public.email_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

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

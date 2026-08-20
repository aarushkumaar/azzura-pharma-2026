-- ============================================================
-- AZZURRA — Settings table fix
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Drops and recreates the settings table cleanly with the
-- correct key/value column structure, then re-applies RLS.
-- ============================================================

-- Step 1: Drop existing settings table (and any dependent policies)
DROP TABLE IF EXISTS public.settings CASCADE;

-- Step 2: Create fresh with correct columns
CREATE TABLE public.settings (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Insert default settings rows
INSERT INTO public.settings (key, value) VALUES
  ('site_name',     'Azzurra'),
  ('contact_phone', '+91 98 71 648 649'),
  ('contact_email', 'info@azzurrapharmaconutrition.com')
ON CONFLICT (key) DO NOTHING;

-- Step 4: Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS policies
-- Anyone can read settings (needed for public site config display)
CREATE POLICY "settings_public_read"
  ON public.settings FOR SELECT
  USING (true);

-- Only authenticated admin can insert or update settings
CREATE POLICY "settings_auth_insert"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "settings_auth_update"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Done. The settings table now has: id, key, value, updated_at
-- ============================================================

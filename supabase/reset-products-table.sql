-- ============================================================
-- AZZURRA — Reset Products Table Only
-- supabase/reset-products-table.sql
--
-- Run this in Supabase SQL Editor BEFORE running the Node scripts.
-- Safe to run multiple times (DROP … IF EXISTS).
-- ============================================================

-- Drop existing products table and all objects that depend on it
DROP TABLE IF EXISTS public.products CASCADE;

-- Recreate with the exact schema the app expects
CREATE TABLE public.products (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  series            TEXT DEFAULT '',
  flavour           TEXT DEFAULT '',
  price_inr         NUMERIC(10,2) DEFAULT 0,
  short_description TEXT DEFAULT '',
  tags              TEXT DEFAULT '',
  benefits          TEXT DEFAULT '',
  ingredients       TEXT DEFAULT '',
  how_to_use        TEXT DEFAULT '',
  nutrition_facts   TEXT DEFAULT '',
  warnings          TEXT DEFAULT '',
  image_folder      TEXT DEFAULT '',
  images            TEXT DEFAULT '[]',
  in_stock          BOOLEAN NOT NULL DEFAULT true,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone (including the shop page) can read products
CREATE POLICY "public_select"
  ON public.products
  FOR SELECT
  TO public
  USING (true);

-- Only authenticated users (admin) can insert / update / delete
CREATE POLICY "auth_all"
  ON public.products
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow the anon key to insert during the sync script
-- (the sync script uses the service role key which bypasses RLS automatically,
--  but if you only have the anon key, this policy lets it insert)
CREATE POLICY "anon_insert"
  ON public.products
  FOR INSERT
  TO public
  WITH CHECK (true);


-- ── DONE ─────────────────────────────────────────────────────
-- After running this SQL:
-- 1. Run: npm run upload-images   (upload photos to Cloudinary)
-- 2. Run: npm run sync-products   (insert rows into this table)
-- 3. Run: npx serve . -p 3000
-- 4. Open: http://localhost:3000/productss.html

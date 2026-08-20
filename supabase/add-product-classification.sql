-- ============================================================
-- AZZURRA — Safe products table enhancement
-- File: supabase/add-product-classification.sql
--
-- Safe to run multiple times (uses IF NOT EXISTS).
-- No destructive changes. No data loss.
--
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add updated_at column for tracking when products were last edited.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Backfill updated_at to match created_at for existing rows.
UPDATE public.products
  SET updated_at = created_at
  WHERE updated_at IS NULL;

-- 3. Create a trigger function that keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 4. Attach the trigger to the products table (drop first if already exists to avoid duplicates).
DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Done. The products table now auto-tracks when each product was last modified.

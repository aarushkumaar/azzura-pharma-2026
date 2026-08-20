-- ============================================================
-- AZZURRA — MIGRATION 004: Extended Products Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Run AFTER 001_initial_schema.sql, 002_..., 003_...
--
-- This migration adds the columns used by the admin panel
-- (admin/products.html) that were missing from the original
-- products schema. Without these columns, admin INSERT/UPDATE
-- calls silently dropped the new fields and the live site
-- never reflected admin changes.
-- ============================================================


-- ============================================================
-- 1. ADD MISSING COLUMNS TO products TABLE
-- ============================================================

-- Product series (Essential / Vital / Max / Provit / Lifeline / Oral)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS series TEXT;

-- Flavour variant (e.g. Chocolate, Vanilla, Unflavoured)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS flavour TEXT;

-- Net weight as a text string (e.g. "500g", "1kg")
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS net_weight TEXT;

-- Folder name inside assets/products/ containing product images
-- Image path: assets/products/{image_folder}/IMAGES/1.jpg
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_folder TEXT;

-- Comma-separated tag strings (e.g. "protein, recovery, muscle")
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags TEXT;

-- Short marketing description shown on listing cards
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Long-form benefits copy
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS benefits TEXT;

-- Full ingredients list
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ingredients TEXT;

-- Usage/dosage instructions
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS how_to_use TEXT;

-- Per-serving nutritional information
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS nutrition_facts TEXT;

-- Safety warnings and notices
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS warnings TEXT;

-- Simple boolean in-stock flag (separate from stock_quantity)
-- Defaults to TRUE so existing products remain visible
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT TRUE;


-- ============================================================
-- 2. BACKFILL in_stock FROM stock_quantity (for existing rows)
--    If stock_quantity = 0 → mark out of stock.
--    Products added before this migration had stock_quantity
--    populated, so we derive in_stock from it.
-- ============================================================
UPDATE products
SET    in_stock = (stock_quantity > 0)
WHERE  in_stock IS TRUE;  -- only update rows not yet manually set


-- ============================================================
-- 3. INDEXES for new columns (improve admin query speed)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_series   ON products (series);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products (in_stock) WHERE in_stock = TRUE;


-- ============================================================
-- VERIFICATION — run this query after applying to confirm:
--
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_name = 'products'
-- ORDER  BY ordinal_position;
--
-- You should see all new columns listed.
-- ============================================================

-- ============================================================
-- AZZURRA — MIGRATION 003: Admin Google OAuth Support
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Run AFTER 001_initial_schema.sql and 002_functions_and_indexes.sql
-- ============================================================

-- ============================================================
-- 1. INSERT ADMIN USER
--    Adds m.pragya119@gmail.com as the first admin.
--    ON CONFLICT DO NOTHING so re-running is safe.
-- ============================================================
INSERT INTO admin_users (email, role)
VALUES ('m.pragya119@gmail.com', 'superadmin')
ON CONFLICT (email) DO NOTHING;
INSERT INTO admin_users (email, role)
VALUES ('aarushk0207@gmail.com', 'superadmin')
ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- 2. RLS POLICY: admin_users — self-read
--
--    The current migration has NO policies on admin_users,
--    so the anon key cannot query it at all.
--
--    We add ONE policy: an authenticated user may SELECT
--    the single row WHERE email = their own JWT email.
--    This lets checkIsAdmin() work without the service role key.
--
--    No INSERT / UPDATE / DELETE policies → only superadmin
--    (via Supabase dashboard or service role) can add admins.
-- ============================================================
DROP POLICY IF EXISTS "admin_users_self_read" ON admin_users;

CREATE POLICY "admin_users_self_read"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (email = auth.jwt() ->> 'email');


-- ============================================================
-- 3. RLS POLICIES: products — admin-only writes
--
--    Current schema: products has only a public read policy.
--    Service role bypasses RLS for writes, which is fine for
--    Edge Functions — but the admin dashboard uses the anon
--    key directly (signInWithPassword / signInWithOAuth).
--
--    We add explicit INSERT / UPDATE / DELETE policies that
--    check admin_users membership via a subquery.
--
--    Note: EXISTS subquery is evaluated per-row but since
--    admin_users is tiny it's effectively instant.
-- ============================================================

-- Allow authenticated admins to insert products
DROP POLICY IF EXISTS "products_admin_insert" ON products;

CREATE POLICY "products_admin_insert"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Allow authenticated admins to update products
DROP POLICY IF EXISTS "products_admin_update" ON products;

CREATE POLICY "products_admin_update"
  ON products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Allow authenticated admins to delete products
DROP POLICY IF EXISTS "products_admin_delete" ON products;

CREATE POLICY "products_admin_delete"
  ON products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE email = auth.jwt() ->> 'email'
    )
  );

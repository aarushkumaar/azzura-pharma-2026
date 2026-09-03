-- =================================================================================
-- 012_order_audit_log_and_payment_status.sql
-- 1. Creates an immutable, append-only order_audit_log table.
-- 2. Creates triggers to audit all order_status and payment_status changes.
-- 3. Protects payment_status so it cannot be manually edited by administrators.
-- 4. Safe and idempotent to run on the existing Supabase database.
-- =================================================================================

-- ── 1. CREATE order_audit_log TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by_user_id  UUID,
  changed_by_email    TEXT,
  old_status          TEXT,
  new_status          TEXT,
  old_payment_status  TEXT,
  new_payment_status  TEXT,
  action              TEXT NOT NULL DEFAULT 'order_status_change',
  metadata            JSONB DEFAULT '{}'::jsonb
);

-- Indexes for fast order history retrieval and chronological sorting
CREATE INDEX IF NOT EXISTS idx_order_audit_log_order_id ON public.order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_log_changed_at ON public.order_audit_log(changed_at DESC);

-- ── 2. ROW LEVEL SECURITY ON order_audit_log ─────────────────────────────────────
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit records
DROP POLICY IF EXISTS "order_audit_log_admin_select" ON public.order_audit_log;
CREATE POLICY "order_audit_log_admin_select"
  ON public.order_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email')
  );

-- Service role has full read access
DROP POLICY IF EXISTS "order_audit_log_service_select" ON public.order_audit_log;
CREATE POLICY "order_audit_log_service_select"
  ON public.order_audit_log
  FOR SELECT
  TO service_role
  USING (true);

-- Explicitly DO NOT create any UPDATE or DELETE policies.
-- Even if an update/delete is attempted, the engine-level trigger below prevents it.

-- ── 3. IMMUTABILITY TRIGGER ON order_audit_log ──────────────────────────────────
-- Ensures that under no circumstances can any audit record be modified or deleted.
CREATE OR REPLACE FUNCTION public.prevent_order_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'order_audit_log records are permanent and immutable. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_immutable_order_audit_log ON public.order_audit_log;
CREATE TRIGGER trigger_immutable_order_audit_log
  BEFORE UPDATE OR DELETE ON public.order_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_audit_log_mutation();

-- ── 4. PROTECT payment_status ON public.orders FROM ADMIN EDITING ────────────────
-- Payment status is system-controlled (Razorpay / Edge Functions with service_role).
-- Admins must NOT be able to manually modify payment_status from the Admin Panel.
CREATE OR REPLACE FUNCTION public.protect_order_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    -- Block any authenticated admin from altering payment_status directly
    IF auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM public.admin_users WHERE email = auth.jwt() ->> 'email') THEN
      RAISE EXCEPTION 'Payment status is system-controlled and cannot be edited by administrators.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_order_payment_status ON public.orders;
CREATE TRIGGER trigger_protect_order_payment_status
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_payment_status();

-- ── 5. AUTOMATIC ORDER AUDIT TRIGGER ON public.orders ────────────────────────────
-- Captures:
-- - Initial order creation
-- - Order status transitions (e.g. Pending -> Confirmed -> Shipped -> Delivered -> Cancelled)
-- - Payment status transitions (e.g. pending -> paid -> failed)
-- Identifies the authenticated admin/user by user_id and email, or flags system/gateway.
CREATE OR REPLACE FUNCTION public.audit_orders_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_action TEXT;
  v_is_status_changed BOOLEAN;
  v_is_payment_changed BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  v_email := COALESCE(
    auth.jwt() ->> 'email',
    CASE
      WHEN auth.role() = 'service_role' THEN 'system (payment gateway)'
      ELSE 'system'
    END
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_audit_log (
      order_id,
      changed_at,
      changed_by_user_id,
      changed_by_email,
      old_status,
      new_status,
      old_payment_status,
      new_payment_status,
      action,
      metadata
    ) VALUES (
      NEW.id,
      NOW(),
      v_user_id,
      v_email,
      NULL,
      NEW.status,
      NULL,
      NEW.payment_status,
      'order_created',
      jsonb_build_object(
        'payment_method', NEW.payment_method,
        'total_amount', NEW.total_amount
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_status_changed := (OLD.status IS DISTINCT FROM NEW.status);
    v_is_payment_changed := (OLD.payment_status IS DISTINCT FROM NEW.payment_status);

    IF v_is_status_changed OR v_is_payment_changed THEN
      IF v_is_status_changed AND v_is_payment_changed THEN
        v_action := 'order_and_payment_status_change';
      ELSIF v_is_status_changed THEN
        v_action := 'order_status_change';
      ELSE
        v_action := 'payment_status_change';
      END IF;

      INSERT INTO public.order_audit_log (
        order_id,
        changed_at,
        changed_by_user_id,
        changed_by_email,
        old_status,
        new_status,
        old_payment_status,
        new_payment_status,
        action,
        metadata
      ) VALUES (
        NEW.id,
        NOW(),
        v_user_id,
        v_email,
        OLD.status,
        NEW.status,
        OLD.payment_status,
        NEW.payment_status,
        v_action,
        jsonb_build_object(
          'razorpay_payment_id', NEW.razorpay_payment_id,
          'razorpay_order_id', NEW.razorpay_order_id
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_orders ON public.orders;
CREATE TRIGGER trigger_audit_orders
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_orders_changes();

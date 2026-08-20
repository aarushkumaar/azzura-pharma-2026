// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: initiateRefund
// Deno runtime. Deploy via: supabase functions deploy initiateRefund
//
// ADMIN-ONLY — caller must provide the service role key in the
// Authorization header. The admin dashboard uses the service role key.
//
// Required environment variables:
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
//   SUPABASE_SERVICE_ROLE_KEY
//
// Receives (POST JSON):
//   { paymentId }   — the UUID of the row in the payments table
// Returns:
//   { success: true, refundId } on success
//   { error: "..." }            on failure
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // ---- Verify this is coming from the admin (service role key) ----
    const authHeader = req.headers.get('Authorization') || '';
    const token      = authHeader.replace('Bearer ', '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (token !== serviceKey) {
      return errorResponse('Unauthorized — admin access only.', 403);
    }

    // ---- Parse request ----
    const { paymentId } = await req.json();

    if (!paymentId) {
      return errorResponse('paymentId is required', 400);
    }

    // ---- Fetch payment row from Supabase ----
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey
    );

    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*, orders(*)')
      .eq('id', paymentId)
      .single();

    if (fetchError || !payment) {
      return errorResponse(`Payment not found: ${fetchError?.message}`, 404);
    }

    if (payment.status === 'refunded') {
      return errorResponse('This payment has already been refunded.', 409);
    }

    if (payment.status !== 'success') {
      return errorResponse(`Cannot refund a payment with status "${payment.status}".`, 400);
    }

    const razorpayKeyId     = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // ---- Initiate refund via Razorpay ----
    // Razorpay refund endpoint: POST /v1/payments/{payment_id}/refund
    const refundRes = await fetch(
      `https://api.razorpay.com/v1/payments/${payment.gateway_payment_id}/refund`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
        },
        body: JSON.stringify({
          // Full refund — amount in paise
          amount: Math.round(payment.amount * 100),
          notes: {
            reason:           'Admin-initiated refund',
            azzurra_order_id: payment.order_id,
          },
        }),
      }
    );

    if (!refundRes.ok) {
      const rzpErr = await refundRes.text();
      throw new Error(`Razorpay refund failed: ${rzpErr}`);
    }

    const refundData = await refundRes.json();

    // ---- Update payment record to 'refunded' ----
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'refunded',
        metadata: {
          ...(payment.metadata || {}),
          refund_id:    refundData.id,
          refunded_at:  new Date().toISOString(),
          refund_amount: payment.amount,
        }
      })
      .eq('id', paymentId);

    if (updateError) {
      console.error('[initiateRefund] Failed to update payment row:', updateError.message);
    }

    // ---- Update order status to 'cancelled' ----
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', payment.order_id);

    return new Response(JSON.stringify({
      success:  true,
      refundId: refundData.id,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('[initiateRefund]', err);
    return errorResponse(err.message, 500);
  }
});

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    status,
  });
}

// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: webhookRazorpay
// Deno runtime. Deploy via: supabase functions deploy webhookRazorpay
//
// Replaces: routes/webhooks.js (Express/Render)
//
// Required environment variables (set in Supabase Dashboard -> Settings -> Edge Functions):
//   RAZORPAY_WEBHOOK_SECRET — your Razorpay webhook secret
//   SUPABASE_URL            — auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase runtime
//
// After deploying, set this URL in Razorpay Dashboard -> Settings -> Webhooks:
//   https://ilduyhuvpiqhvbnocqxf.supabase.co/functions/v1/webhookRazorpay
//
// Events handled:
//   payment.captured   -> order status = 'paid',  payment status = 'captured'
//   payment.authorized -> order status = 'paid',  payment status = 'authorized'
//   payment.failed     -> order status = 'payment_failed', payment status = 'failed'
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Read raw body (required for HMAC verification)
    const rawBody = await req.arrayBuffer();
    const bodyBytes = new Uint8Array(rawBody);
    const bodyText = new TextDecoder().decode(bodyBytes);

    // Verify HMAC-SHA256 signature
    const webhookSecret = (Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '').trim();
    if (!webhookSecret) {
      console.error('[webhookRazorpay] RAZORPAY_WEBHOOK_SECRET is not set');
      return new Response('Server configuration error', { status: 500 });
    }

    const signature = req.headers.get('x-razorpay-signature') || '';
    if (!signature) {
      console.warn('[webhookRazorpay] Missing x-razorpay-signature header');
      return new Response('Missing signature', { status: 400 });
    }

    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, bodyBytes);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (expectedSignature !== signature) {
      console.warn('[webhookRazorpay] Signature mismatch');
      return new Response('Invalid signature', { status: 400 });
    }

    // Parse payload (safe now that signature is verified)
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch (_) {
      return new Response('Invalid JSON payload', { status: 400 });
    }

    const event = payload?.event;
    const paymentEntity = payload?.payload?.payment?.entity;

    if (!paymentEntity) {
      console.log('[webhookRazorpay] Non-payment event: ' + event);
      return new Response('OK', { status: 200 });
    }

    const rzpOrderId   = paymentEntity.order_id;
    const rzpPaymentId = paymentEntity.id;
    const amountInr    = (paymentEntity.amount || 0) / 100;
    const status       = paymentEntity.status;

    console.log('[webhookRazorpay] Event: ' + event + ' | RZP Order: ' + rzpOrderId + ' | Payment: ' + rzpPaymentId);

    // Initialize Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find internal order by Razorpay order ID
    const { data: orderRows, error: findErr } = await supabase
      .from('orders')
      .select('id, status')
      .eq('razorpay_order_id', rzpOrderId)
      .limit(1);

    if (findErr) {
      console.error('[webhookRazorpay] DB lookup failed: ' + findErr.message);
      return new Response('DB error', { status: 500 });
    }

    if (!orderRows || orderRows.length === 0) {
      console.warn('[webhookRazorpay] No order found for Razorpay order ID: ' + rzpOrderId);
      return new Response('Order not found — acknowledged', { status: 200 });
    }

    const internalOrderId = orderRows[0].id;

    if (event === 'payment.captured' || event === 'payment.authorized') {
      await supabase
        .from('orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', internalOrderId);

      await supabase
        .from('payments')
        .upsert({
          order_id:           internalOrderId,
          gateway:            'razorpay',
          gateway_payment_id: rzpPaymentId,
          amount:             amountInr,
          status:             status === 'captured' ? 'captured' : 'authorized',
          metadata: { razorpay_payment_id: rzpPaymentId, razorpay_order_id: rzpOrderId, event },
        }, { onConflict: 'gateway_payment_id', ignoreDuplicates: false });

      console.log('[webhookRazorpay] Order ' + internalOrderId + ' marked as paid');

    } else if (event === 'payment.failed') {
      await supabase
        .from('orders')
        .update({ status: 'payment_failed', updated_at: new Date().toISOString() })
        .eq('id', internalOrderId);

      await supabase
        .from('payments')
        .upsert({
          order_id:           internalOrderId,
          gateway:            'razorpay',
          gateway_payment_id: rzpPaymentId,
          amount:             amountInr,
          status:             'failed',
          metadata: {
            razorpay_payment_id: rzpPaymentId,
            razorpay_order_id:   rzpOrderId,
            event,
            error_code:          paymentEntity.error_code || null,
            error_description:   paymentEntity.error_description || null,
          },
        }, { onConflict: 'gateway_payment_id', ignoreDuplicates: false });

      console.log('[webhookRazorpay] Order ' + internalOrderId + ' marked as payment_failed');
    } else {
      console.log('[webhookRazorpay] Unhandled event: ' + event);
    }

    return new Response('Webhook processed successfully', { status: 200 });

  } catch (err: any) {
    console.error('[webhookRazorpay] Error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: createRazorpayOrder
// Deno runtime. Deploy via: supabase functions deploy createRazorpayOrder
//
// Required environment variables (set in Supabase Dashboard):
//   RAZORPAY_KEY_ID     — Your Razorpay Key ID (rzp_live_xxx)
//   RAZORPAY_KEY_SECRET — Your Razorpay Key Secret
//   SUPABASE_URL        — Auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — Auto-provided by Supabase runtime
//
// Receives (POST JSON):
//   { orderId, amount, currency }
// Returns:
//   { razorpayOrderId }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { orderId, amount, currency = 'INR' } = await req.json();

    if (!orderId || !amount) {
      return errorResponse('Missing required fields: orderId or amount', 400);
    }

    const razorpayKeyId     = (Deno.env.get('RAZORPAY_KEY_ID') || '').trim();
    const razorpayKeySecret = (Deno.env.get('RAZORPAY_KEY_SECRET') || '').trim();

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Server configuration error: Razorpay Edge Function secrets are missing or empty.');
    }

    if (!razorpayKeyId.startsWith('rzp_')) {
      throw new Error('Server configuration error: RAZORPAY_KEY_ID must start with rzp_live_ or rzp_test_.');
    }

    // Amount for Razorpay is in paise (1 INR = 100 paise)
    const amountPaise = Math.round(amount * 100);

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        // Razorpay uses HTTP Basic Auth: Key ID : Key Secret
        'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
      body: JSON.stringify({
        amount:          amountPaise,
        currency:        currency,
        receipt:         `azz_${orderId.toString().substring(0, 8)}`,
        notes: {
          azzurra_order_id: orderId.toString(),
        },
      }),
    });

    if (!razorpayRes.ok) {
      const rzpErr = await razorpayRes.text();
      throw new Error(`Razorpay API Error: ${rzpErr}`);
    }

    const razorpayOrder = await razorpayRes.json();

    // ---- Initialize Supabase admin client (bypasses RLS) ----
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ---- Store the Razorpay order ID back on the order row ----
    await supabase
      .from('orders')
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq('id', orderId);

    // ---- Insert initial payment record (status: initiated) ----
    await supabase.from('payments').insert({
      order_id:           orderId,
      gateway:            'razorpay',
      gateway_payment_id: razorpayOrder.id,
      amount:             amount,
      currency:           currency,
      status:             'initiated',
      metadata:           razorpayOrder,
    });

    // ---- Return data to frontend ----
    return new Response(JSON.stringify({
      razorpayOrderId: razorpayOrder.id,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('[createRazorpayOrder]', err);
    return errorResponse(err.message, 500);
  }
});

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    status,
  });
}

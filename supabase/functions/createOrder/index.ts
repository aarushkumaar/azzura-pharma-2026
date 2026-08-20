// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: createOrder
// Deno runtime. Deploy via: supabase functions deploy createOrder
//
// Required environment variables (set in Supabase Dashboard):
//   RAZORPAY_KEY_ID     — Your Razorpay Key ID (rzp_live_xxx)
//   RAZORPAY_KEY_SECRET — Your Razorpay Key Secret
//   SUPABASE_URL        — Auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — Auto-provided by Supabase runtime
//
// Receives (POST JSON):
//   { cart, total_amount, shipping_address, currency }
// Returns:
//   { orderId, razorpayOrderId, amount, currency, keyId }
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
    // ---- Parse request body ----
    const { cart, total_amount, shipping_address, currency = 'INR' } = await req.json();

    if (!cart || cart.length === 0) {
      return errorResponse('Cart is empty', 400);
    }

    // ---- Initialize Supabase admin client (bypasses RLS) ----
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ---- Create the order row (status: pending) ----
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        status:           'pending',
        total_amount:     total_amount,
        shipping_address: shipping_address,
        // customer_id can be linked once auth is implemented
      })
      .select()
      .single();

    if (orderError) throw new Error(`DB order creation failed: ${orderError.message}`);

    // ---- Insert order_items ----
    const items = cart.map((item: any) => ({
      order_id:   order.id,
      product_id: item.product_id,
      quantity:   item.quantity,
      unit_price: item.unit_price,
      subtotal:   item.subtotal,
    }));

    const { error: itemsError } = await supabase.from('order_items').insert(items);
    if (itemsError) throw new Error(`DB order_items insertion failed: ${itemsError.message}`);

    // ---- Create Razorpay order ----
    const razorpayKeyId     = Deno.env.get('RAZORPAY_KEY_ID')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    // Amount for Razorpay is in paise (1 INR = 100 paise)
    const amountPaise = Math.round(total_amount * 100);

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
        receipt:         `azz_${order.id.substring(0, 8)}`,
        notes: {
          azzurra_order_id: order.id,
        },
      }),
    });

    if (!razorpayRes.ok) {
      const rzpErr = await razorpayRes.text();
      throw new Error(`Razorpay order creation failed: ${rzpErr}`);
    }

    const razorpayOrder = await razorpayRes.json();

    // ---- Store the Razorpay order ID back on the order row ----
    await supabase
      .from('orders')
      .update({ payment_intent_id: razorpayOrder.id })
      .eq('id', order.id);

    // ---- Insert initial payment record (status: initiated) ----
    await supabase.from('payments').insert({
      order_id:           order.id,
      gateway:            'razorpay',
      gateway_payment_id: razorpayOrder.id,
      amount:             total_amount,
      currency:           currency,
      status:             'initiated',
      metadata:           razorpayOrder,
    });

    // ---- Return data to frontend ----
    return new Response(JSON.stringify({
      orderId:        order.id,
      razorpayOrderId: razorpayOrder.id,
      amount:          razorpayOrder.amount,   // In paise
      currency:        razorpayOrder.currency,
      keyId:           razorpayKeyId,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('[createOrder]', err);
    return errorResponse(err.message, 500);
  }
});

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    status,
  });
}

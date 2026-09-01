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

    // ---- 1. Securely validate coupon and recalculate amount ----
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, items')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new Error(`Order not found or database error: ${orderErr?.message}`);
    }

    // ---- Verify User Authorization ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    
    if (userErr || !user) {
      throw new Error('Unauthorized: Invalid or missing user token.');
    }

    if (order.customer_user_id !== user.id) {
      throw new Error('Unauthorized: You do not have permission to process this order.');
    }

    // Parse items to calculate subtotal
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.quantity)), 0);
    
    let secureDiscountAmount = 0;

    // Validate Coupon if one was provided
    if (order.coupon_code) {
      const { data: couponData, error: couponErr } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', order.coupon_code)
        .eq('is_active', true);

      const coupon = couponData && couponData.length > 0 ? couponData[0] : null;

      if (!coupon) {
        throw new Error('Invalid or inactive coupon code.');
      }

      // Expiry check
      if (coupon.expiry_date) {
        const expiry = new Date(coupon.expiry_date);
        const today = new Date();
        today.setHours(0,0,0,0);
        if (expiry < today) {
          throw new Error('Coupon has expired.');
        }
      }

      // Usage limit check
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        throw new Error('Coupon usage limit reached.');
      }

      // Minimum order value check
      const minVal = Number(coupon.min_order_value) || 0;
      if (subtotal < minVal) {
        throw new Error(`Minimum order for this coupon is ₹${minVal}.`);
      }

      // Per-customer check
      if (coupon.per_customer) {
        const { data: usageData } = await supabase
          .from('coupon_usage')
          .select('id')
          .eq('coupon_id', coupon.id)
          .eq('customer_email', order.customer_email);
        
        if (usageData && usageData.length > 0) {
          throw new Error('You have already used this coupon.');
        }
      }

      // Calculate secure discount
      secureDiscountAmount = coupon.discount_type === 'percentage'
        ? Math.round(subtotal * (Number(coupon.discount_value) / 100))
        : Number(coupon.discount_value) || 0;

      if (secureDiscountAmount > subtotal) secureDiscountAmount = subtotal;
    }

    const secureTotalAmount = subtotal - secureDiscountAmount;
    const secureAmountPaise = Math.round(secureTotalAmount * 100);

    // If frontend sent a completely manipulated amount, we rely on the secure one.
    // We will update the order to reflect the truth securely calculated here.
    if (order.total_amount !== secureTotalAmount || order.discount_amount !== secureDiscountAmount) {
      await supabase
        .from('orders')
        .update({
          total_amount: secureTotalAmount,
          discount_amount: secureDiscountAmount
        })
        .eq('id', orderId);
    }

    // ---- 2. Call Razorpay API ----
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        // Razorpay uses HTTP Basic Auth: Key ID : Key Secret
        'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
      body: JSON.stringify({
        amount:          secureAmountPaise,
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

    // ---- 3. Store the Razorpay order ID back on the order row ----
    await supabase
      .from('orders')
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq('id', orderId);

    // ---- 4. Insert initial payment record (status: initiated) ----
    await supabase.from('payments').insert({
      order_id:           orderId,
      gateway:            'razorpay',
      gateway_payment_id: razorpayOrder.id,
      amount:             secureTotalAmount,
      currency:           currency,
      status:             'initiated',
      metadata:           razorpayOrder,
    });

    // ---- 5. Return data to frontend ----
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

const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Note: In production, instantiate this once and export it
const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Pricing constants (Should match frontend cart.js logic)
const CATALOG = {
  "1": { price: 15999, name: "Luminary Molecular Serum" },
  "2": { price: 41999, name: "CellSync Pulse Device" },
  "3": { price: 9999, name: "Neuro-Prime Catalyst" },
  "4": { price: 54999, name: "The Genesis System" },
  "5": { price: 17999, name: "Telomere Elixir" },
  "6": { price: 7499, name: "Azzura Bio-Patch" }
};
const COUPONS = {
  'AZZURA10':   { type:'percent', value:10 },
  'WELLNESS20': { type:'percent', value:20 },
  'FIRST500':   { type:'flat',    value:500 }
};
const SHIPPING_THRESHOLD = 5000;
const SHIPPING_COST = 199;
const GST_RATE = 0.18;

// Utility to calculate totals securely on server
function calculateTotals(cart, couponCode) {
  const subtotal = cart.reduce((sum, item) => {
    const p = CATALOG[item.id];
    return sum + (p ? p.price * item.qty : 0);
  }, 0);

  let discount = 0;
  if (couponCode && COUPONS[couponCode]) {
    const c = COUPONS[couponCode];
    discount = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value;
    discount = Math.min(discount, subtotal);
  }

  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const gst = Math.round(afterDiscount * GST_RATE);
  const total = afterDiscount + shipping + gst;

  return { subtotal, discount, shipping, tax: gst, total };
}

// 1. Create Order
router.post('/create', async (req, res) => {
  try {
    const { cart, customer, coupon } = req.body;
    const db = req.db;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Verify pricing server-side to prevent tampering
    const pricing = calculateTotals(cart, coupon);
    const internalOrderId = 'az_ord_' + uuidv4().replace(/-/g, '').substring(0, 12);

    // Create Razorpay order
    const rzp = getRazorpayInstance();
    const rzpOrder = await rzp.orders.create({
      amount: pricing.total * 100, // amount in paise
      currency: "INR",
      receipt: internalOrderId,
      payment_capture: 1 // auto-capture
    });

    // Save to DB
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Upsert customer
      const custRes = await client.query(
        `INSERT INTO customers (email, phone, first_name, last_name) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO UPDATE SET phone=$2, first_name=$3, last_name=$4
         RETURNING id`,
        [customer.email, customer.phone, customer.fname, customer.lname]
      );
      const customerId = custRes.rows[0].id;

      // Insert Order
      await client.query(
        `INSERT INTO orders (id, razorpay_order_id, customer_id, subtotal, discount, shipping, tax, total_amount, coupon_code, shipping_address, shipping_city, shipping_state, shipping_pincode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [internalOrderId, rzpOrder.id, customerId, pricing.subtotal, pricing.discount, pricing.shipping, pricing.tax, pricing.total, coupon || null, customer.address, customer.city, customer.state, customer.pincode]
      );

      // Insert Order Items
      for (const item of cart) {
        const p = CATALOG[item.id];
        if (p) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [internalOrderId, item.id, p.name, item.qty, p.price, p.price * item.qty]
          );
        }
      }

      await client.query('COMMIT');

      // Return order details to frontend to initiate checkout
      res.json({
        orderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      });

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// 2. Verify Payment (Called by frontend after successful Razorpay checkout)
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const db = req.db;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Update DB status
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Update order status
        await client.query(
          `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE razorpay_order_id = $1 RETURNING id`,
          [razorpay_order_id]
        );

        // Record payment
        await client.query(
          `INSERT INTO payments (order_id, razorpay_payment_id, razorpay_signature, amount, status)
           SELECT id, $2, $3, total_amount, 'captured' FROM orders WHERE razorpay_order_id = $1
           ON CONFLICT (razorpay_payment_id) DO NOTHING`,
          [razorpay_order_id, razorpay_payment_id, razorpay_signature]
        );

        await client.query('COMMIT');
        
        res.json({ success: true, message: "Payment verified successfully" });
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }

  } catch (error) {
    console.error("Payment verification failed:", error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Note: Ensure this route is mounted AFTER the `express.raw()` middleware in server.js
router.post('/razorpay', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const db = req.db;

    // Validate signature using raw body
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn("Webhook signature mismatch");
      return res.status(400).send('Invalid signature');
    }

    // Parse payload safely now that signature is verified
    const payload = JSON.parse(req.body.toString());
    const event = payload.event;
    const paymentEntity = payload.payload.payment.entity;

    const rzpOrderId = paymentEntity.order_id;
    const rzpPaymentId = paymentEntity.id;
    const amount = paymentEntity.amount / 100; // convert paise to INR
    const status = paymentEntity.status;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      if (event === 'payment.captured' || event === 'payment.authorized') {
        // Find internal order ID
        const orderRes = await client.query('SELECT id FROM orders WHERE razorpay_order_id = $1', [rzpOrderId]);
        
        if (orderRes.rows.length > 0) {
          const orderId = orderRes.rows[0].id;

          // Update order status
          await client.query(
            `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [orderId]
          );

          // Insert or update payment record
          await client.query(
            `INSERT INTO payments (order_id, razorpay_payment_id, amount, status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (razorpay_payment_id) DO UPDATE SET status = $4`,
            [orderId, rzpPaymentId, amount, status]
          );
        }
      } 
      else if (event === 'payment.failed') {
        const errorDesc = paymentEntity.error_description;
        const errorCode = paymentEntity.error_code;

        const orderRes = await client.query('SELECT id FROM orders WHERE razorpay_order_id = $1', [rzpOrderId]);
        
        if (orderRes.rows.length > 0) {
          const orderId = orderRes.rows[0].id;

          // Update order status
          await client.query(
            `UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [orderId]
          );

          // Insert payment failure record
          await client.query(
            `INSERT INTO payments (order_id, razorpay_payment_id, amount, status, error_code, error_description)
             VALUES ($1, $2, $3, 'failed', $4, $5)
             ON CONFLICT (razorpay_payment_id) DO UPDATE SET status = 'failed', error_code = $4, error_description = $5`,
            [orderId, rzpPaymentId, amount, errorCode, errorDesc]
          );
        }
      }

      await client.query('COMMIT');
      res.status(200).send('Webhook processed successfully');

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;

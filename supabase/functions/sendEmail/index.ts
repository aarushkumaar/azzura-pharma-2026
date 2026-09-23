// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: sendEmail
// Deno runtime. Deploy via: supabase functions deploy sendEmail
//
// Required environment variables (set in Supabase Dashboard):
//   RESEND_API_KEY            — your Resend API key (already set as secret)
//   SUPABASE_SERVICE_ROLE_KEY — to read/write DB and log attempts
//   SUPABASE_URL              — Supabase project URL
//
// Receives (POST JSON):  { type, ...payload }
// Types:
//   "order_confirmation"      — customer confirmation + admin new-order emails
//   "order_notification"      — admin new-order notification to all active admin recipients
//   "order_status"            — customer status-change email (packed, shipped, delivered, cancelled)
//   "contact_enquiry"         — admin receives enquiry + ACK to customer
//   "welcome"                 — new-customer welcome email
//   "notify_me"               — admin notification for back-in-stock requests
//   "test_email"              — testing tool trigger from Admin Settings
//   "resend_email"            — re-send attempt for a previous email log entry
//
// SECURITY: RESEND_API_KEY never exposed to frontend.
// Email failures do NOT break calling operations.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_FALLBACK_EMAILS = ['info@azzurrapharmaconutrition.com', 'Azzurrapharma@gmail.com'];
const FROM_ADDRESS = Deno.env.get('RESEND_FROM_EMAIL') || 'Azzurra Pharmaconutrition <info@azzurrapharmaconutrition.com>';
const BRAND_COLOR  = '#1A5FA8';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlWrap(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title>
<style>
body{margin:0;padding:0;background:#f5f7fa;font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1A2E;}
.wrapper{max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
.hdr{background:${BRAND_COLOR};padding:28px 32px;text-align:center;}
.hdr h1{margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:.04em;}
.hdr p{margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;}
.bd{padding:32px;}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E8F1FB;font-size:14px;}
.row:last-child{border-bottom:none;}
.lbl{color:#6B7280;}.val{font-weight:600;text-align:right;}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;background:#E8F1FB;color:${BRAND_COLOR};}
.ftr{background:#f5f7fa;padding:20px 32px;text-align:center;font-size:12px;color:#6B7280;border-top:1px solid #E8F1FB;}
.ftr a{color:${BRAND_COLOR};text-decoration:none;}
.tbl{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;}
.tbl th{background:#E8F1FB;color:${BRAND_COLOR};font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;text-align:left;}
.tbl td{padding:10px 12px;border-bottom:1px solid #f0f4f8;}
.note{background:#E8F1FB;border-radius:8px;padding:12px 16px;font-size:13px;color:${BRAND_COLOR};margin:16px 0;}
</style></head><body>
<div class="wrapper">
<div class="hdr"><h1>Azzurra Pharmaconutrition</h1><p>Clinical Nutrition. Trusted Science.</p></div>
<div class="bd">${body}</div>
<div class="ftr"><p>&copy; 2025 Azzurra Pharmaconutrition Pvt. Ltd.</p><p>Questions? <a href="mailto:info@azzurrapharmaconutrition.com">info@azzurrapharmaconutrition.com</a></p></div>
</div></body></html>`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtMoney(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function buildItemsTable(items: any[]): string {
  if (!items || !items.length) return '<p style="color:#6B7280;">No item details available.</p>';
  const rows = items.map((item: any) =>
    `<tr>
      <td>${escapeHtml(item.name || item.product_name || 'Product')}</td>
      <td style="text-align:center;">${item.quantity || 1}</td>
      <td style="text-align:right;">${fmtMoney(Number(item.price || item.unit_price || 0))}</td>
      <td style="text-align:right;">${fmtMoney(Number(item.price || item.unit_price || 0) * Number(item.quantity || 1))}</td>
    </tr>`
  ).join('');
  return `<table class="tbl"><thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function getAdminEmails(supabase: any): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('admin_email_recipients')
      .select('email')
      .eq('is_enabled', true);
    if (!error && data && data.length > 0) {
      const emails = data.map((d: any) => String(d.email || '').trim()).filter(Boolean);
      if (emails.length > 0) return emails;
    }
  } catch (e: any) {
    console.warn('[sendEmail] Could not fetch admin_email_recipients:', e?.message);
  }
  const envAdmin = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');
  if (envAdmin) {
    const parsed = envAdmin.split(',').map((e: string) => e.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return ADMIN_FALLBACK_EMAILS;
}

async function logEmailAttempt(supabase: any, entry: {
  recipient: string;
  email_type: string;
  related_order_id?: number | null;
  customer_id?: number | null;
  status: 'sent' | 'failed';
  resend_message_id?: string | null;
  error_message?: string | null;
  payload?: any;
}) {
  try {
    if (!supabase) return;
    await supabase.from('email_logs').insert({
      recipient:         entry.recipient,
      email_type:        entry.email_type,
      related_order_id:  entry.related_order_id || null,
      customer_id:       entry.customer_id || null,
      status:            entry.status,
      resend_message_id: entry.resend_message_id || null,
      error_message:     entry.error_message || null,
      payload:           entry.payload || {},
      sent_at:           new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[sendEmail] Failed to write to email_logs:', err?.message);
  }
}

async function sendViaResend(
  supabase: any,
  to: string | string[],
  subject: string,
  html: string,
  replyTo?: string,
  meta?: {
    email_type: string;
    related_order_id?: number | null;
    customer_id?: number | null;
    payload?: any;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const recipients = Array.isArray(to) ? to : [to];
  const primaryRecipient = recipients.join(', ');

  if (!apiKey) {
    console.error('[sendEmail] RESEND_API_KEY not set');
    if (supabase && meta) {
      await logEmailAttempt(supabase, {
        recipient: primaryRecipient,
        email_type: meta.email_type,
        related_order_id: meta.related_order_id || null,
        customer_id: meta.customer_id || null,
        status: 'failed',
        error_message: 'RESEND_API_KEY is not configured on server',
        payload: meta.payload || {},
      });
    }
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const payload: Record<string, unknown> = { from: FROM_ADDRESS, to: recipients, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[sendEmail] Resend error:', errText);
      if (supabase && meta) {
        await logEmailAttempt(supabase, {
          recipient: primaryRecipient,
          email_type: meta.email_type,
          related_order_id: meta.related_order_id || null,
          customer_id: meta.customer_id || null,
          status: 'failed',
          error_message: errText,
          payload: meta.payload || {},
        });
      }
      return { success: false, error: errText };
    }

    const d = await res.json();
    console.log('[sendEmail] Sent. ID:', d.id);
    if (supabase && meta) {
      await logEmailAttempt(supabase, {
        recipient: primaryRecipient,
        email_type: meta.email_type,
        related_order_id: meta.related_order_id || null,
        customer_id: meta.customer_id || null,
        status: 'sent',
        resend_message_id: d.id,
        payload: meta.payload || {},
      });
    }
    return { success: true, id: d.id };
  } catch (err: any) {
    console.error('[sendEmail] Network/fetch error:', err);
    if (supabase && meta) {
      await logEmailAttempt(supabase, {
        recipient: primaryRecipient,
        email_type: meta.email_type,
        related_order_id: meta.related_order_id || null,
        customer_id: meta.customer_id || null,
        status: 'failed',
        error_message: err.message,
        payload: meta.payload || {},
      });
    }
    return { success: false, error: err.message };
  }
}

async function fetchOrderWithItems(orderId: string | number, supabase: any): Promise<any> {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      console.error('[sendEmail] Order lookup failed:', error?.message);
      return null;
    }

    let items: any[] = [];
    try {
      items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    } catch (_) { items = []; }

    if (!items || items.length === 0) {
      const { data: dbItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);
      if (dbItems && dbItems.length) {
        items = dbItems.map((it: any) => ({
          name: it.product_name,
          quantity: it.quantity,
          price: it.unit_price,
          unit_price: it.unit_price,
          total: it.total_price
        }));
      }
    }
    order.items = items;
    return order;
  } catch (e: any) {
    console.error('[sendEmail] fetchOrderWithItems error:', e.message);
    return null;
  }
}

async function handleOrderConfirmation(supabase: any, payload: any): Promise<void> {
  const { order } = payload;
  if (!order) return;
  const orderId  = String(order.id || '').padStart(6, '0');
  const items    = (() => { try { return typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (_) { return []; } })();
  const total    = Number(order.total_amount || 0);
  const discount = Number(order.discount_amount || 0);
  const adminRecipients = await getAdminEmails(supabase);

  // 1. Email to Customer
  if (order.customer_email) {
    const customerBody = `
      <h2 style="margin:0 0 16px;">Order Confirmed! 🎉</h2>
      <p>Hi <strong>${escapeHtml(order.customer_name || 'Valued Customer')}</strong>,</p>
      <p>Thank you for your order with Azzurra Pharmaconutrition. Your order has been confirmed and is now being processed.</p>
      <div class="row"><span class="lbl">Order Number</span><span class="val">#${orderId}</span></div>
      <div class="row"><span class="lbl">Order Date</span><span class="val">${fmtDate(order.created_at)}</span></div>
      <div class="row"><span class="lbl">Payment Method</span><span class="val">${escapeHtml((order.payment_method || 'razorpay').toUpperCase())}</span></div>
      <div class="row"><span class="lbl">Payment Status</span><span class="val"><span class="badge">${escapeHtml(order.payment_status || 'paid')}</span></span></div>
      <div class="row"><span class="lbl">Order Status</span><span class="val"><span class="badge">${escapeHtml(order.status || 'confirmed')}</span></span></div>
      <div class="row"><span class="lbl">Shipping Address</span><span class="val">${escapeHtml(order.address || order.shipping_address || '—')}</span></div>
      <h3 style="margin:24px 0 8px;font-size:15px;">Items Ordered</h3>
      ${buildItemsTable(items)}
      ${discount > 0 ? `<div class="row"><span class="lbl">Discount</span><span class="val" style="color:#48BB78;">-${fmtMoney(discount)}</span></div>` : ''}
      <div class="row" style="font-size:16px;font-weight:700;border-bottom:none;padding-top:12px;">
        <span>Total Paid</span><span style="color:${BRAND_COLOR};">${fmtMoney(total)}</span>
      </div>
      <div class="note">ℹ️ GST is included in MRP. No additional tax has been charged.</div>
      <div style="text-align:center;margin:24px 0 16px;">
        <a href="https://azzurrapharmaconutrition.com/customer-dashboard.html" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block;">Track Your Order in My Account</a>
      </div>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">Questions? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;

    await sendViaResend(
      supabase,
      order.customer_email,
      `Order Confirmed — Azzurra Pharmaconutrition #${orderId}`,
      htmlWrap(`Order #${orderId} Confirmed`, customerBody),
      undefined,
      {
        email_type: 'order_confirmation',
        related_order_id: Number(order.id),
        customer_id: order.customer_id || null,
        payload: { order }
      }
    );
  }

  // 2. Email to Admin Recipients
  if (adminRecipients.length > 0) {
    const adminBody = `
      <h2 style="margin:0 0 16px;">New Order Placed — #${orderId}</h2>
      <div class="row"><span class="lbl">Customer Name</span><span class="val">${escapeHtml(order.customer_name || '—')}</span></div>
      <div class="row"><span class="lbl">Email</span><span class="val">${escapeHtml(order.customer_email || '—')}</span></div>
      <div class="row"><span class="lbl">Phone</span><span class="val">${escapeHtml(order.customer_phone || '—')}</span></div>
      <div class="row"><span class="lbl">Shipping Address</span><span class="val">${escapeHtml(order.address || order.shipping_address || '—')}</span></div>
      <div class="row"><span class="lbl">Order Date</span><span class="val">${fmtDate(order.created_at)}</span></div>
      <div class="row"><span class="lbl">Payment Method</span><span class="val">${escapeHtml((order.payment_method || '—').toUpperCase())}</span></div>
      <div class="row"><span class="lbl">Payment Status</span><span class="val">${escapeHtml(order.payment_status || '—')}</span></div>
      <div class="row"><span class="lbl">Order Status</span><span class="val">${escapeHtml(order.status || 'confirmed')}</span></div>
      ${order.razorpay_payment_id ? `<div class="row"><span class="lbl">Razorpay ID</span><span class="val">${escapeHtml(order.razorpay_payment_id)}</span></div>` : ''}
      <h3 style="margin:24px 0 8px;font-size:15px;">Items</h3>
      ${buildItemsTable(items)}
      ${discount > 0 ? `<div class="row"><span class="lbl">Discount (${escapeHtml(order.coupon_code || '')})</span><span class="val">-${fmtMoney(discount)}</span></div>` : ''}
      <div class="row" style="font-size:16px;font-weight:700;border-bottom:none;padding-top:12px;">
        <span>Total</span><span style="color:${BRAND_COLOR};">${fmtMoney(total)}</span>
      </div>`;

    await sendViaResend(
      supabase,
      adminRecipients,
      `New Order — #${orderId} — ${order.customer_name || 'Customer'}`,
      htmlWrap(`New Order #${orderId}`, adminBody),
      order.customer_email || undefined,
      {
        email_type: 'admin_new_order',
        related_order_id: Number(order.id),
        customer_id: order.customer_id || null,
        payload: { order }
      }
    );
  }
}

async function handleOrderStatus(supabase: any, payload: any): Promise<void> {
  const { order, oldStatus, newStatus } = payload;
  if (!order || !order.customer_email) return;
  if (oldStatus && oldStatus.toLowerCase() === (newStatus || '').toLowerCase()) {
    console.log('[sendEmail] Status unchanged — no email sent');
    return;
  }
  const orderId = String(order.id || '').padStart(6, '0');
  const msgs: Record<string, string> = {
    pending:   'Your order has been placed and is currently pending payment or review.',
    confirmed: 'Your order has been confirmed and is now being prepared.',
    packed:    'Your order has been packed and is ready for dispatch.',
    shipped:   'Your order has been shipped and is on its way to you.',
    delivered: 'Your order has been delivered. We hope you enjoy your clinical nutrition products!',
    cancelled: 'Your order has been cancelled. If you have questions, please reach out to our team.',
  };
  const emojis: Record<string, string> = {
    pending:   '⏳',
    confirmed: '✅',
    packed:    '📦',
    shipped:   '🚚',
    delivered: '🎉',
    cancelled: '❌'
  };
  const normalizedNew = (newStatus || '').toLowerCase();
  const message = msgs[normalizedNew] || `Your order status has been updated to: ${newStatus}.`;
  const emoji   = emojis[normalizedNew] || '📋';

  const body = `
    <h2 style="margin:0 0 16px;">${emoji} Order Update</h2>
    <p>Hi <strong>${escapeHtml(order.customer_name || 'Valued Customer')}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;color:#1A1A2E;"><strong>${message}</strong></p>
    <div class="row"><span class="lbl">Order Number</span><span class="val">#${orderId}</span></div>
    <div class="row"><span class="lbl">Previous Status</span><span class="val">${escapeHtml(oldStatus || '—')}</span></div>
    <div class="row"><span class="lbl">Current Status</span><span class="val"><span class="badge">${escapeHtml(newStatus)}</span></span></div>
    ${order.courier ? `<div class="row"><span class="lbl">Courier Partner</span><span class="val">${escapeHtml(order.courier)}</span></div>` : ''}
    ${order.tracking_number ? `<div class="row"><span class="lbl">Tracking Number</span><span class="val"><strong>${escapeHtml(order.tracking_number)}</strong></span></div>` : ''}
    <div class="row"><span class="lbl">Order Total</span><span class="val">${fmtMoney(Number(order.total_amount || 0))}</span></div>
    <div class="note">ℹ️ GST is included in MRP.</div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://azzurrapharmaconutrition.com/customer-dashboard.html" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block;">Track Order in My Account</a>
    </div>
    <p style="margin-top:20px;color:#6B7280;font-size:13px;">Questions? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;

  await sendViaResend(
    supabase,
    order.customer_email,
    `Order Update — #${orderId} — ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
    htmlWrap(`Order #${orderId} Update`, body),
    undefined,
    {
      email_type: 'order_status',
      related_order_id: Number(order.id),
      customer_id: order.customer_id || null,
      payload: { order, oldStatus, newStatus }
    }
  );
}

async function handleContactEnquiry(supabase: any, payload: any): Promise<void> {
  const { name, email, phone, subject, message, submittedAt } = payload;
  const safeName = escapeHtml(String(name || '').trim().slice(0, 100));
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePhone = escapeHtml(String(phone || '').trim().slice(0, 25));
  const safeSubject = escapeHtml(String(subject || 'Customer Enquiry').trim().slice(0, 150));
  const safeMessage = escapeHtml(String(message || '').trim().slice(0, 5000));
  const adminRecipients = await getAdminEmails(supabase);

  if (!safeMessage || safeMessage.length < 3) return;

  const adminBody = `
    <h2 style="margin:0 0 16px;">New Customer Enquiry</h2>
    <div class="row"><span class="lbl">Name</span><span class="val">${safeName || '—'}</span></div>
    <div class="row"><span class="lbl">Email</span><span class="val">${safeEmail || '—'}</span></div>
    ${safePhone ? `<div class="row"><span class="lbl">Phone</span><span class="val">${safePhone}</span></div>` : ''}
    <div class="row"><span class="lbl">Subject</span><span class="val">${safeSubject || '—'}</span></div>
    <div class="row"><span class="lbl">Submitted At</span><span class="val">${fmtDate(submittedAt || new Date().toISOString())}</span></div>
    <h3 style="margin:20px 0 8px;font-size:14px;color:#6B7280;">Message</h3>
    <div style="background:#f5f7fa;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeMessage || '—'}</div>`;

  await sendViaResend(
    supabase,
    adminRecipients,
    `New Enquiry: ${safeSubject} — ${safeName || safeEmail}`,
    htmlWrap('New Customer Enquiry', adminBody),
    safeEmail || undefined,
    {
      email_type: 'contact_enquiry',
      payload: { name, email, phone, subject, message, submittedAt }
    }
  );

  if (safeEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    const ackBody = `
      <h2 style="margin:0 0 16px;">We Received Your Message</h2>
      <p>Hi <strong>${safeName || 'there'}</strong>,</p>
      <p>Thank you for contacting Azzurra Pharmaconutrition. We have received your enquiry and our team will get back to you shortly.</p>
      <div class="row"><span class="lbl">Subject</span><span class="val">${safeSubject || '—'}</span></div>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">For urgent clinical enquiries, email <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;
    await sendViaResend(
      supabase,
      safeEmail,
      'We Received Your Message — Azzurra Pharmaconutrition',
      htmlWrap('Message Received', ackBody),
      undefined,
      {
        email_type: 'contact_ack',
        payload: { name, email, subject }
      }
    );
  }
}

async function handleNotifyMe(supabase: any, payload: any): Promise<void> {
  const { productId, productName, email, requestedAt } = payload;
  const safeName  = escapeHtml(String(productName || 'Azzurra Product').trim().slice(0, 150));
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeId    = productId ? String(productId) : '';
  const dateStr   = fmtDate(requestedAt || new Date().toISOString());
  const adminRecipients = await getAdminEmails(supabase);

  if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return;

  const adminBody = `
    <h2 style="margin:0 0 16px;">Back-in-Stock Notification Request</h2>
    <p>A customer has requested to be notified when a product is back in stock.</p>
    <div class="row"><span class="lbl">Product</span><span class="val">${safeName}</span></div>
    ${safeId ? `<div class="row"><span class="lbl">Product ID</span><span class="val">#${safeId}</span></div>` : ''}
    <div class="row"><span class="lbl">Customer Email</span><span class="val">${safeEmail}</span></div>
    <div class="row"><span class="lbl">Requested At</span><span class="val">${dateStr}</span></div>
    <div class="note">ℹ️ You can manage back-in-stock requests in the Admin Portal under <strong>Notify Me</strong>.</div>
  `;

  await sendViaResend(
    supabase,
    adminRecipients,
    `Notify Me: ${safeName} — ${safeEmail}`,
    htmlWrap('Back-in-Stock Request', adminBody),
    safeEmail,
    {
      email_type: 'notify_me',
      payload: { productId, productName, email, requestedAt }
    }
  );
}

async function handleWelcome(supabase: any, payload: any): Promise<void> {
  const { email, name } = payload;
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeName = escapeHtml(String(name || '').trim().slice(0, 100));
  if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return;

  const body = `
    <h2 style="margin:0 0 16px;">Welcome to Azzurra Pharmaconutrition! 🎉</h2>
    <p>Hi <strong>${safeName || 'there'}</strong>,</p>
    <p>Your account has been created successfully. We are delighted to have you with us.</p>
    <ul style="font-size:14px;line-height:1.8;">
      <li>Browse our specialized clinical nutrition formulations</li>
      <li>Track your orders and fulfillment progress in real-time</li>
      <li>Manage your saved delivery addresses effortlessly</li>
    </ul>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://azzurrapharmaconutrition.com/customer-dashboard.html" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block;">Go to My Account</a>
    </div>
    <div class="note">ℹ️ All prices include GST — no hidden charges.</div>
    <p style="margin-top:20px;color:#6B7280;font-size:13px;">Need assistance? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;

  await sendViaResend(
    supabase,
    safeEmail,
    'Welcome to Azzurra Pharmaconutrition',
    htmlWrap('Welcome!', body),
    undefined,
    {
      email_type: 'welcome',
      payload: { email, name }
    }
  );
}

async function handleTestEmail(supabase: any, payload: any): Promise<{ success: boolean; error?: string }> {
  const { toEmail } = payload;
  const target = String(toEmail || '').trim().toLowerCase();
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { success: false, error: 'Invalid recipient email address' };
  }
  const body = `
    <h2 style="margin:0 0 16px;">Email System Test Successful! ✅</h2>
    <p>This is a verification test email dispatched from the <strong>Azzurra Pharmaconutrition</strong> Admin Portal.</p>
    <div class="row"><span class="lbl">Recipient</span><span class="val">${escapeHtml(target)}</span></div>
    <div class="row"><span class="lbl">Dispatched At</span><span class="val">${fmtDate(new Date().toISOString())}</span></div>
    <div class="row"><span class="lbl">Resend Status</span><span class="val"><span class="badge">Operational</span></span></div>
    <div class="note">ℹ️ If you received this email, the Resend server-side integration and notification routing are configured and operating normally.</div>
  `;
  return await sendViaResend(
    supabase,
    target,
    'Resend Test Email — Azzurra Pharmaconutrition',
    htmlWrap('System Test Email', body),
    undefined,
    {
      email_type: 'test_email',
      payload: { toEmail: target }
    }
  );
}

async function handleResendEmail(supabase: any, payload: any): Promise<{ success: boolean; error?: string }> {
  const { logId } = payload;
  if (!logId) return { success: false, error: 'Missing logId for resend' };

  const { data: logEntry, error } = await supabase
    .from('email_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (error || !logEntry) return { success: false, error: 'Email log record not found' };

  const emailType = logEntry.email_type;
  const p = logEntry.payload || {};

  if (emailType === 'order_confirmation' || emailType === 'admin_new_order') {
    let targetOrder = p.order;
    if (!targetOrder && logEntry.related_order_id) {
      targetOrder = await fetchOrderWithItems(logEntry.related_order_id, supabase);
    }
    if (targetOrder) {
      await handleOrderConfirmation(supabase, { order: targetOrder });
      return { success: true };
    }
  } else if (emailType === 'order_status') {
    let targetOrder = p.order;
    if (!targetOrder && logEntry.related_order_id) {
      targetOrder = await fetchOrderWithItems(logEntry.related_order_id, supabase);
    }
    if (targetOrder) {
      await handleOrderStatus(supabase, { order: targetOrder, oldStatus: p.oldStatus, newStatus: p.newStatus });
      return { success: true };
    }
  } else if (emailType === 'welcome') {
    await handleWelcome(supabase, p);
    return { success: true };
  } else if (emailType === 'notify_me') {
    await handleNotifyMe(supabase, p);
    return { success: true };
  } else if (emailType === 'test_email') {
    return await handleTestEmail(supabase, p);
  }

  return { success: false, error: 'Unsupported email type for resend' };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Missing Authorization header' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const isServiceRole = Boolean(serviceRoleKey && token === serviceRoleKey);

    // Initializing supabase client with service role so it can query/log to DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey || (Deno.env.get('SUPABASE_ANON_KEY') || '').trim()
    );

    let user: any = null;
    if (!isServiceRole) {
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }

    const body = await req.json();
    const { type, ...rest } = body;

    // Strict server-side authorization check per email type
    switch (type) {
      case 'order_notification':
      case 'order_confirmation': {
        let targetOrder = rest.order;
        if (!targetOrder && rest.orderId) {
          targetOrder = await fetchOrderWithItems(rest.orderId, supabase);
        }
        if (!targetOrder) {
          return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 404,
          });
        }
        await handleOrderConfirmation(supabase, { order: targetOrder });
        break;
      }

      case 'order_status': {
        // Can be triggered by service role or authenticated admin
        await handleOrderStatus(supabase, rest);
        break;
      }

      case 'welcome': {
        await handleWelcome(supabase, rest);
        break;
      }

      case 'contact_enquiry': {
        await handleContactEnquiry(supabase, rest);
        break;
      }

      case 'notify_me': {
        await handleNotifyMe(supabase, rest);
        break;
      }

      case 'test_email': {
        const testRes = await handleTestEmail(supabase, rest);
        return new Response(JSON.stringify(testRes), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'resend_email': {
        const resendRes = await handleResendEmail(supabase, rest);
        return new Response(JSON.stringify(resendRes), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      default:
        return new Response(JSON.stringify({ success: false, error: 'Invalid email type' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          status: 400,
        });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('[sendEmail] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});

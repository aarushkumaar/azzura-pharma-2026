// ============================================================
// AZZURRA — SUPABASE EDGE FUNCTION: sendEmail
// Deno runtime. Deploy via: supabase functions deploy sendEmail
//
// Required environment variables (set in Supabase Dashboard):
//   RESEND_API_KEY  — your Resend API key (already set as secret)
//
// Receives (POST JSON):  { type, ...payload }
// Types:
//   "order_confirmation"  — customer + admin new-order emails
//   "order_status"        — customer status-change email
//   "contact_enquiry"     — admin receives enquiry + ACK to customer
//   "welcome"             — new-customer welcome email
//
// SECURITY: RESEND_API_KEY never exposed to frontend.
// Email failures do NOT break orders.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_EMAIL = (Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'Azzurrapharma@gmail.com, info@azzurrapharmaconutrition.com')
  .split(',')
  .map((e: string) => e.trim())
  .filter(Boolean);
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
      <td>${item.name || 'Product'}</td>
      <td style="text-align:center;">${item.quantity || 1}</td>
      <td style="text-align:right;">${fmtMoney(Number(item.price || item.unit_price || 0))}</td>
      <td style="text-align:right;">${fmtMoney(Number(item.price || item.unit_price || 0) * Number(item.quantity || 1))}</td>
    </tr>`
  ).join('');
  return `<table class="tbl"><thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function sendViaResend(to: string | string[], subject: string, html: string, replyTo?: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) { console.error('[sendEmail] RESEND_API_KEY not set'); return; }
  const payload: Record<string, unknown> = { from: FROM_ADDRESS, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error('[sendEmail] Resend error:', await res.text()); }
  else { const d = await res.json(); console.log('[sendEmail] Sent. ID:', d.id); }
}

async function handleOrderConfirmation(payload: any): Promise<void> {
  const { order } = payload;
  if (!order) return;
  const orderId  = String(order.id || '').padStart(6, '0');
  const items    = (() => { try { return typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (_) { return []; } })();
  const total    = Number(order.total_amount || 0);
  const discount = Number(order.discount_amount || 0);

  if (order.customer_email) {
    const customerBody = `
      <h2 style="margin:0 0 16px;">Order Confirmed! 🎉</h2>
      <p>Hi <strong>${order.customer_name || 'Valued Customer'}</strong>,</p>
      <p>Thank you for your order. Your payment has been received and your order is being processed.</p>
      <div class="row"><span class="lbl">Order Number</span><span class="val">#${orderId}</span></div>
      <div class="row"><span class="lbl">Order Date</span><span class="val">${fmtDate(order.created_at)}</span></div>
      <div class="row"><span class="lbl">Payment Status</span><span class="val"><span class="badge">${order.payment_status || 'paid'}</span></span></div>
      <div class="row"><span class="lbl">Order Status</span><span class="val"><span class="badge">${order.status || 'confirmed'}</span></span></div>
      <div class="row"><span class="lbl">Shipping Address</span><span class="val">${order.address || '—'}</span></div>
      <h3 style="margin:24px 0 8px;font-size:15px;">Items Ordered</h3>
      ${buildItemsTable(items)}
      ${discount > 0 ? `<div class="row"><span class="lbl">Discount</span><span class="val" style="color:#48BB78;">-${fmtMoney(discount)}</span></div>` : ''}
      <div class="row" style="font-size:16px;font-weight:700;border-bottom:none;padding-top:12px;">
        <span>Total Paid</span><span style="color:${BRAND_COLOR};">${fmtMoney(total)}</span>
      </div>
      <div class="note">ℹ️ GST is included in MRP. No additional tax has been charged.</div>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">Questions? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;
    await sendViaResend(order.customer_email, `Order Confirmed — Azzurra Pharmaconutrition #${orderId}`, htmlWrap(`Order #${orderId} Confirmed`, customerBody));
  }

  const adminBody = `
    <h2 style="margin:0 0 16px;">New Order — #${orderId}</h2>
    <div class="row"><span class="lbl">Customer Name</span><span class="val">${order.customer_name || '—'}</span></div>
    <div class="row"><span class="lbl">Email</span><span class="val">${order.customer_email || '—'}</span></div>
    <div class="row"><span class="lbl">Phone</span><span class="val">${order.customer_phone || '—'}</span></div>
    <div class="row"><span class="lbl">Shipping Address</span><span class="val">${order.address || '—'}</span></div>
    <div class="row"><span class="lbl">Order Date</span><span class="val">${fmtDate(order.created_at)}</span></div>
    <div class="row"><span class="lbl">Payment Method</span><span class="val">${order.payment_method || '—'}</span></div>
    <div class="row"><span class="lbl">Payment Status</span><span class="val">${order.payment_status || '—'}</span></div>
    ${order.razorpay_payment_id ? `<div class="row"><span class="lbl">Razorpay Payment ID</span><span class="val">${order.razorpay_payment_id}</span></div>` : ''}
    <h3 style="margin:24px 0 8px;font-size:15px;">Items</h3>
    ${buildItemsTable(items)}
    ${discount > 0 ? `<div class="row"><span class="lbl">Discount (${order.coupon_code || ''})</span><span class="val">-${fmtMoney(discount)}</span></div>` : ''}
    <div class="row" style="font-size:16px;font-weight:700;border-bottom:none;padding-top:12px;">
      <span>Total</span><span style="color:${BRAND_COLOR};">${fmtMoney(total)}</span>
    </div>`;
  await sendViaResend(ADMIN_EMAIL, `New Order — #${orderId} — ${order.customer_name || 'Customer'}`, htmlWrap(`New Order #${orderId}`, adminBody));
}

async function handleOrderStatus(payload: any): Promise<void> {
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
    delivered: 'Your order has been delivered. We hope you enjoy your products!',
    cancelled: 'Your order has been cancelled. If you have questions, please contact us.',
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
    <div class="row"><span class="lbl">New Status</span><span class="val"><span class="badge">${escapeHtml(newStatus)}</span></span></div>
    <div class="row"><span class="lbl">Order Total</span><span class="val">${fmtMoney(Number(order.total_amount || 0))}</span></div>
    <div class="note">ℹ️ GST is included in MRP.</div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://azzurrapharmaconutrition.com/customer-dashboard.html" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block;">View Order in My Account</a>
    </div>
    <p style="margin-top:20px;color:#6B7280;font-size:13px;">Questions? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;
  await sendViaResend(order.customer_email, `Order Update — #${orderId} — ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`, htmlWrap(`Order #${orderId} Update`, body));
}

async function handleContactEnquiry(payload: any): Promise<void> {
  const { name, email, phone, subject, message, submittedAt } = payload;
  const safeName = escapeHtml(String(name || '').trim().slice(0, 100));
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePhone = escapeHtml(String(phone || '').trim().slice(0, 25));
  const safeSubject = escapeHtml(String(subject || 'Contact Form Enquiry').trim().slice(0, 150));
  const safeMessage = escapeHtml(String(message || '').trim().slice(0, 5000));

  if (!safeMessage || safeMessage.length < 5) return;

  const adminBody = `
    <h2 style="margin:0 0 16px;">New Customer Enquiry</h2>
    <div class="row"><span class="lbl">Name</span><span class="val">${safeName || '—'}</span></div>
    <div class="row"><span class="lbl">Email</span><span class="val">${safeEmail || '—'}</span></div>
    ${safePhone ? `<div class="row"><span class="lbl">Phone</span><span class="val">${safePhone}</span></div>` : ''}
    <div class="row"><span class="lbl">Subject</span><span class="val">${safeSubject || '—'}</span></div>
    <div class="row"><span class="lbl">Submitted At</span><span class="val">${fmtDate(submittedAt || new Date().toISOString())}</span></div>
    <h3 style="margin:20px 0 8px;font-size:14px;color:#6B7280;">Message</h3>
    <div style="background:#f5f7fa;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeMessage || '—'}</div>`;
  
  await sendViaResend(ADMIN_EMAIL, `New Enquiry: ${safeSubject} — from ${safeName || safeEmail}`, htmlWrap('New Customer Enquiry', adminBody), safeEmail || undefined);
  
  if (safeEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    const ackBody = `
      <h2 style="margin:0 0 16px;">We Received Your Message</h2>
      <p>Hi <strong>${safeName || 'there'}</strong>,</p>
      <p>Thank you for reaching out to Azzurra Pharmaconutrition. We have received your enquiry and will get back to you shortly.</p>
      <div class="row"><span class="lbl">Subject</span><span class="val">${safeSubject || '—'}</span></div>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">For urgent matters, email <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;
    await sendViaResend(safeEmail, 'We Received Your Message — Azzurra Pharmaconutrition', htmlWrap('Message Received', ackBody));
  }
}

async function handleWelcome(payload: any): Promise<void> {
  const { email, name } = payload;
  const safeEmail = String(email || '').trim().toLowerCase();
  const safeName = escapeHtml(String(name || '').trim().slice(0, 100));
  if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return;

  const body = `
    <h2 style="margin:0 0 16px;">Welcome to Azzurra Pharmaconutrition! 🎉</h2>
    <p>Hi <strong>${safeName || 'there'}</strong>,</p>
    <p>Your account has been created successfully. We are delighted to have you as part of the Azzurra family.</p>
    <ul style="font-size:14px;line-height:1.8;">
      <li>Browse our clinical nutrition products</li>
      <li>Track your orders anytime</li>
      <li>Manage your delivery addresses</li>
    </ul>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://azzurrapharmaconutrition.com/customer-dashboard.html" style="background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block;">Go to My Account</a>
    </div>
    <div class="note">ℹ️ All prices include GST — no hidden charges.</div>
    <p style="margin-top:20px;color:#6B7280;font-size:13px;">Need help? <a href="mailto:info@azzurrapharmaconutrition.com" style="color:${BRAND_COLOR};">info@azzurrapharmaconutrition.com</a></p>`;
  await sendViaResend(safeEmail, 'Welcome to Azzurra Pharmaconutrition', htmlWrap('Welcome!', body));
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

    let user: any = null;
    if (!isServiceRole) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        serviceRoleKey || (Deno.env.get('SUPABASE_ANON_KEY') || '').trim()
      );
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }

    const body = await req.json();
    const { type, ...rest } = body;

    // Strict server-side authorization check per email type
    switch (type) {
      case 'order_confirmation': {
        // Order confirmations must ONLY be triggered server-side by verifyPayment or webhookRazorpay
        if (!isServiceRole) {
          return new Response(JSON.stringify({ success: false, error: 'Forbidden: Service role required for order confirmation emails' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 403,
          });
        }
        await handleOrderConfirmation(rest);
        break;
      }

      case 'order_status': {
        // Order status changes can only be triggered by the authorized admin or service role
        const isAdmin = user && user.email === 'info@azzurrapharmaconutrition.com';
        if (!isServiceRole && !isAdmin) {
          return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin authorization required' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 403,
          });
        }
        await handleOrderStatus(rest);
        break;
      }

      case 'welcome': {
        // Welcome email can only be sent for the user's own email address or service role
        const targetEmail = String(rest.email || '').trim().toLowerCase();
        const userEmail = String(user?.email || '').trim().toLowerCase();
        if (!isServiceRole && (!user || !userEmail || userEmail !== targetEmail)) {
          return new Response(JSON.stringify({ success: false, error: 'Forbidden: Cannot trigger welcome email for another recipient' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            status: 403,
          });
        }
        await handleWelcome(rest);
        break;
      }

      case 'contact_enquiry': {
        // Contact enquiry is open to site visitors (with valid anon key or user token),
        // but admin recipient is hard-coded, input is sanitized, and ACK is sent only to sender.
        await handleContactEnquiry(rest);
        break;
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
    // Return 200 — email failures must never break calling operations
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});

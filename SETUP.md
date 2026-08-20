# Azzurra Pharmaconutrition — Full-Stack Setup Guide

## Project Structure

```
azzura/
├── index.html                    # Main landing page
├── productss.html                # ★ Rebuilt shop page (dynamic, Supabase-connected)
├── checkout.html                 # ★ Checkout with Razorpay
├── order-confirmation.html       # ★ Post-payment confirmation
├── admin-login.html              # ★ Admin magic-link login
├── admin.html                    # ★ Admin dashboard (auth-protected)
├── about.html
├── science.html
├── contact.html
├── product-detail.html
├── config.js                     # ★ GITIGNORED — fill in your keys
├── .gitignore
│
├── assets/
│   ├── css/
│   │   ├── style.css             # Main design system (shared)
│   │   ├── shop.css              # ★ Shop-specific styles
│   │   ├── checkout.css          # ★ Checkout styles
│   │   └── admin.css             # ★ Admin dashboard styles
│   ├── js/
│   │   ├── main.js               # Shared JS (navbar, animations)
│   │   ├── shop.js               # ★ Product loading, cart, filtering
│   │   ├── checkout.js           # ★ Razorpay checkout flow
│   │   └── admin.js              # ★ Admin dashboard logic
│   └── images/
│       └── README.md             # ★ Image naming guide
│
└── supabase/
    ├── config.toml               # ★ Supabase CLI config
    ├── migrations/
    │   ├── 001_initial_schema.sql # ★ Full DB schema + seed data
    │   └── 002_functions_and_indexes.sql # ★ RPC + indexes
    └── functions/
        ├── .env.example          # ★ Edge Function secrets template
        ├── createOrder/index.ts  # ★ Creates DB order + Razorpay order
        ├── verifyPayment/index.ts # ★ Verifies HMAC, marks order paid
        └── initiateRefund/index.ts # ★ Admin-only Razorpay refund
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Supabase account](https://app.supabase.com) | Free tier OK | Database + Auth + Edge Functions |
| [Razorpay account](https://dashboard.razorpay.com) | Test mode | Payment gateway |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | ≥ 1.150 | Deploy Edge Functions |
| Any static file server | — | Serve HTML locally |

---

## Step 1 — Set Up Supabase

### 1.1 Create a Project
1. Go to [app.supabase.com](https://app.supabase.com) → **New Project**
2. Note your **Project URL** and **API Keys** from Settings → API

### 1.2 Run Database Migrations
1. Open Supabase Dashboard → **SQL Editor → New Query**
2. Paste the contents of [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) and run
3. Paste [`supabase/migrations/002_functions_and_indexes.sql`](supabase/migrations/002_functions_and_indexes.sql) and run
4. You should see 7 new tables in the **Table Editor**

### 1.3 Add Your First Admin User
```sql
-- Run in Supabase SQL Editor after creating your auth account
INSERT INTO admin_users (email, role)
VALUES ('your-admin@email.com', 'superadmin');
```

---

## Step 2 — Configure Frontend Credentials

Open [`config.js`](config.js) and fill in your values:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJh...YOUR_ANON_KEY';
const RAZORPAY_KEY_ID   = 'rzp_test_YOUR_KEY_ID';
```

> ⚠️ `config.js` is gitignored — never commit this file.

---

## Step 3 — Deploy Edge Functions

### 3.1 Install Supabase CLI (if not already installed)
```powershell
# Windows — via Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or download binary from:
# https://github.com/supabase/cli/releases
```

### 3.2 Link Your Project
```powershell
cd C:\Users\aarus\AARUSH\CODING\pragya_azzura\azzura
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3.3 Set Edge Function Secrets
```powershell
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx
supabase secrets set RAZORPAY_KEY_SECRET=your_secret_here
```

### 3.4 Deploy All Functions
```powershell
supabase functions deploy createOrder
supabase functions deploy verifyPayment
supabase functions deploy initiateRefund
```

### 3.5 Verify Deployment
Check in Supabase Dashboard → **Edge Functions** — all three should show "Active".

---

## Step 4 — Serve the Site Locally

Use any static server. VS Code Live Server works perfectly:

1. Install [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**
3. Navigate to `http://localhost:5500/productss.html`

Or use Python:
```powershell
cd C:\Users\aarus\AARUSH\CODING\pragya_azzura\azzura
python -m http.server 5500
```

---

## Step 5 — Add Product Images

1. Add product images to `assets/images/`
2. Use filenames matching the seed data (see [`assets/images/README.md`](assets/images/README.md))
3. Recommended: 600×750 px JPEG, < 200 KB

> If images are missing, the shop shows a CSS gradient placeholder automatically.

---

## Step 6 — Test the Full Flow

### Shop Page (`productss.html`)
- [ ] Products load from Supabase (check browser Network tab)
- [ ] Category filter buttons work (All Products, Molecular Serums, etc.)
- [ ] Need tag pills filter correctly (Longevity, Cognition, Recovery, Radiance)
- [ ] Sort dropdown changes order
- [ ] "Add to Cart" adds item and updates cart badge count
- [ ] Cart drawer opens/closes, shows items, quantities update correctly
- [ ] "Proceed to Checkout" goes to `checkout.html`

### Checkout (`checkout.html`)
- [ ] Order summary shows cart items
- [ ] Form validation highlights empty/invalid fields
- [ ] Submitting opens Razorpay modal (use [test card](https://razorpay.com/docs/payments/payments/test-card-details/): 4111 1111 1111 1111)
- [ ] After payment: redirected to `order-confirmation.html`
- [ ] Order row appears in Supabase `orders` table with status `paid`
- [ ] Payment row appears in `payments` table with status `success`

### Admin Dashboard (`admin.html`)
- [ ] Accessing without login redirects to `admin-login.html`
- [ ] Magic link email received and works
- [ ] Non-admin email shows "Access Denied" screen
- [ ] Overview KPIs show live data
- [ ] Bar chart and donut chart render
- [ ] Orders table shows all orders; clicking opens side panel
- [ ] Status update works (e.g. paid → processing)
- [ ] Products CRUD: add, edit, delete, toggle flags
- [ ] Settings: change gateway, save announcement, select featured products

---

## Razorpay Test Cards

| Card Number          | CVV | Expiry | Result  |
|----------------------|-----|--------|---------|
| 4111 1111 1111 1111  | Any | Any    | Success |
| 5267 3181 8797 5449  | Any | Any    | Success |
| 4000 0000 0000 0002  | Any | Any    | Failure |

For UPI testing: use `success@razorpay` as the UPI ID.

---

## Going Live

1. Replace `rzp_test_` key with `rzp_live_` key in `config.js`
2. Update `RAZORPAY_KEY_ID` secret in Supabase Edge Functions
3. Update `RAZORPAY_KEY_SECRET` secret in Supabase Edge Functions
4. Update `site_url` in `supabase/config.toml` to your production domain
5. Deploy to any static host (Netlify, Vercel, GitHub Pages, or your own server)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Products don't load | Check `config.js` has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY` |
| "Showing offline mode" banner | Supabase unreachable or anon key invalid |
| Razorpay modal doesn't open | Check browser console for Edge Function errors; verify secrets are set |
| Payment verified but order not updated | Check `verifyPayment` Edge Function logs in Supabase Dashboard |
| Admin shows "Access Denied" | Insert your email into `admin_users` table via SQL Editor |
| Magic link not received | Check spam folder; verify auth email settings in Supabase Dashboard |

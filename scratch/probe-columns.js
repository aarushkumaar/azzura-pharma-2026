const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const candidateColumns = {
  orders: [
    'id', 'customer_id', 'status', 'total_amount', 'payment_intent_id', 'shipping_address',
    'created_at', 'updated_at', 'payment_method', 'coupon_code', 'discount_amount',
    'customer_user_id', 'subtotal', 'discount', 'shipping', 'tax', 'total',
    'razorpay_order_id', 'shipping_city', 'shipping_state', 'shipping_pincode'
  ],
  customers: [
    'id', 'email', 'full_name', 'phone', 'created_at', 'total_lifetime_value',
    'first_name', 'last_name'
  ],
  notify_me_requests: [
    'id', 'product_id', 'product_name', 'email', 'created_at'
  ]
};

async function probe() {
  for (const [table, cols] of Object.entries(candidateColumns)) {
    console.log(`\nProbing table: ${table}`);
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(1);
      if (error) {
        console.log(`  - ${col}: Error - ${error.message} (code: ${error.code || ''})`);
      } else {
        console.log(`  - ${col}: EXISTS`);
      }
    }
  }
}

probe();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const candidateColumns = {
  orders: [
    'id', 'customer_name', 'customer_email', 'customer_phone', 'items',
    'total_amount', 'address', 'status', 'created_at'
  ],
  customers: [
    'id', 'name', 'email', 'phone', 'last_activity', 'cart_activity', 'created_at'
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

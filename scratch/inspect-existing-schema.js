const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  const tables = [
    'products',
    'orders',
    'order_items',
    'customers',
    'coupons',
    'coupon_usage',
    'notify_me_requests',
    'contact_messages',
    'homepage_banners',
    'payments',
    'admin_users',
    'site_settings',
    'customer_profiles',
    'customer_addresses'
  ];

  for (const table of tables) {
    console.log(`\n=== Table: ${table} ===`);
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`  Query error: ${error.message} (${error.code || ''})`);
      } else if (data && data.length > 0) {
        console.log('  Exists: YES (columns below):');
        const row = data[0];
        for (const [key, val] of Object.entries(row)) {
          console.log(`    - ${key}: val type: ${typeof val} (sample: ${JSON.stringify(val)})`);
        }
      } else {
        console.log('  Exists: YES (but empty)');
      }
    } catch (err) {
      console.log(`  Unexpected error:`, err.message);
    }
  }
}

inspect();

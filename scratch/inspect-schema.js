const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  const tables = [
    'products',
    'orders',
    'customers',
    'coupons',
    'coupon_usage',
    'notify_me_requests',
    'contact_messages',
    'homepage_banners'
  ];

  for (const table of tables) {
    console.log(`\n=== Table: ${table} ===`);
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.error(`Error querying ${table}:`, error.message);
      } else if (data && data.length > 0) {
        console.log('Columns and types (from first row):');
        const row = data[0];
        for (const [key, val] of Object.entries(row)) {
          console.log(`  - ${key}: type of val is ${typeof val} (val: ${JSON.stringify(val)})`);
        }
      } else {
        console.log('Table is empty, fetching schema info via postgrest headers/spec...');
      }
    } catch (err) {
      console.error(`Unexpected error for ${table}:`, err.message);
    }
  }
}

inspect();

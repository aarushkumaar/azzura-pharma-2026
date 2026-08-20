const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify() {
  const tables = ['admin_users', 'contact_messages', 'homepage_banners', 'coupons'];
  console.log('Verifying Phase 1 tables:');
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error && error.code === 'PGRST205') {
        console.log(`  - ${table}: Missing (Not Created Yet)`);
      } else if (error) {
        console.log(`  - ${table}: Exists (Received other error: ${error.message})`);
      } else {
        console.log(`  - ${table}: Verified (Successfully queried)`);
      }
    } catch (err) {
      console.log(`  - ${table}: Error checking:`, err.message);
    }
  }
}

verify();

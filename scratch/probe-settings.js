const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function probeSettings() {
  console.log('Probing table: settings');
  try {
    const { data, error } = await supabase.from('settings').select('*').limit(1);
    if (error) {
      console.log(`  Query error: ${error.message} (${error.code || ''})`);
    } else {
      console.log('  Exists: YES');
      if (data && data.length > 0) {
        console.log('  Columns:', Object.keys(data[0]));
      } else {
        // Table is empty, probe individual columns
        const cols = ['id', 'key', 'value', 'updated_at'];
        for (const col of cols) {
          const { error: colErr } = await supabase.from('settings').select(col).limit(1);
          if (colErr) {
            console.log(`    - ${col}: does NOT exist (${colErr.message})`);
          } else {
            console.log(`    - ${col}: EXISTS`);
          }
        }
      }
    }
  } catch (err) {
    console.log('  Unexpected error:', err.message);
  }
}

probeSettings();

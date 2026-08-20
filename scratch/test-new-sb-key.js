const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testNewKey() {
  console.log('Testing connection with new Supabase key...');
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .limit(1);

  if (error) {
    console.error('Select failed:', error.message);
  } else {
    console.log('Select success! Data:', data);
  }

  // Try insert
  console.log('Attempting insert with new key...');
  const { data: insData, error: insError } = await supabase
    .from('products')
    .insert([{ name: 'TEST_NEW_KEY', price_inr: 10 }])
    .select();

  if (insError) {
    console.error('Insert failed:', insError.message);
  } else {
    console.log('Insert success!', insData);
  }
}

testNewKey();

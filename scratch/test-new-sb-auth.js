const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_u3CI59G2YV4DKyGrm3gqIg_2mLGWVg5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testAuth() {
  console.log('Testing auth with new key...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'aarushk0207@gmail.com',
    password: 'AarushLovesfood'
  });

  if (error) {
    console.error('Auth failed:', error.message);
  } else {
    console.log('Auth success! User:', data.user.email);
    console.log('Attempting insert after auth...');
    const { data: insData, error: insError } = await supabase
      .from('products')
      .insert([{ name: 'TEST_AUTH_WRITE', price_inr: 20 }])
      .select();

    if (insError) {
      console.error('Insert failed after auth:', insError.message);
    } else {
      console.log('Insert success after auth!', insData);
      // cleanup
      await supabase.from('products').delete().eq('id', insData[0].id);
    }
  }
}

testAuth();

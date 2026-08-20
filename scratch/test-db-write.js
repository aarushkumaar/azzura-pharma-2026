const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testWrite() {
  const dummyProduct = {
    name: 'TEST_INSERT_ANON',
    price_inr: 99.99,
    short_description: 'Test insert using anon key',
  };

  console.log('Attempting insert with anon key...');
  const { data, error } = await supabase
    .from('products')
    .insert([dummyProduct])
    .select();

  if (error) {
    console.error('Insert failed:', error.message);
  } else {
    console.log('Insert success!', data);
    // Cleanup the dummy insert
    const { error: delError } = await supabase
      .from('products')
      .delete()
      .eq('id', data[0].id);
    console.log('Cleanup delete:', delError ? delError.message : 'success');
  }
}

testWrite();

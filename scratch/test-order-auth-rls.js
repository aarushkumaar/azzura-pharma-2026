const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testOrderAuthInsert() {
  const email = `testuser_${Date.now()}@gmail.com`;
  const password = 'TestPassword123!';

  console.log('Signing up new user:', email);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password
  });

  if (authError) {
    console.error('Sign up failed:', authError.message);
    return;
  }
  
  console.log('Authenticated as:', authData.user.email);
  
  const { v4: uuidv4 } = require('uuid');
  const orderId = uuidv4();
  
  const payload = {
    customer_email: authData.user.email,
    customer_user_id: authData.user.id,
    total_amount: 100,
    status: "pending",
    payment_method: "cod",
    payment_status: "pending",
    items: "[{\"id\":1}]"
  };

  console.log("Testing insert with items column...");
  const { data, error: err2 } = await supabase.from('orders').insert([payload]).select();
  console.log("Insert result:", err2 ? err2.message : "Success");
  if (!err2) {
    console.log("Inserted order data:", data);
  }
}

testOrderAuthInsert();

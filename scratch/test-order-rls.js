const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testOrderInsert() {
  const payload = {
    customer_email: "test@example.com",
    total_amount: 100,
    status: "pending",
    payment_method: "cod",
    payment_status: "pending"
  };

  console.log("Testing insert without select...");
  const { data: insertOnly, error: err1 } = await supabase.from('orders').insert([payload]);
  console.log("Insert only result:", err1 ? err1.message : "Success");

  console.log("Testing insert with select...");
  const { data: insertSelect, error: err2 } = await supabase.from('orders').insert([payload]).select();
  console.log("Insert+Select result:", err2 ? err2.message : "Success");
}

testOrderInsert();

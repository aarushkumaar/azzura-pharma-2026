const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkColumnType(table, column, testValue) {
  const payload = {};
  payload[column] = testValue;
  const { error } = await supabase.from(table).insert([payload]);
  if (error && error.message.includes('invalid input syntax')) {
    return error.message;
  }
  if (error && error.code === 'PGRST204') {
    return 'Column does not exist';
  }
  return error ? error.message : 'Success (or RLS block)';
}

async function audit() {
  console.log("=== AUDITING SCHEMA ===");
  
  // 1. Check orders table columns
  console.log("\n-- Checking orders --");
  console.log("id type (sending text):", await checkColumnType('orders', 'id', 'not-a-uuid-or-int'));
  console.log("customer_id type (sending text):", await checkColumnType('orders', 'customer_id', 'not-an-int'));
  console.log("customer_user_id type (sending text):", await checkColumnType('orders', 'customer_user_id', 'not-a-uuid'));
  console.log("user_id type (sending text):", await checkColumnType('orders', 'user_id', 'not-a-uuid'));

  // 2. Check order_items
  console.log("\n-- Checking order_items --");
  console.log("order_id type:", await checkColumnType('order_items', 'order_id', 'not-an-int'));

  // 3. Check customers
  console.log("\n-- Checking customers --");
  console.log("id type:", await checkColumnType('customers', 'id', 'not-a-uuid-or-int'));
  
  // 5. Check RLS policies on orders
  console.log("\n-- Checking RLS Policies on orders --");
  // We cannot directly query pg_policies using anon key unless it's exposed, but let's try.
  const { data: policies, error: polErr } = await supabase.from('pg_policies').select('*').eq('tablename', 'orders');
  if (polErr) {
    console.log("Cannot query pg_policies:", polErr.message);
  } else {
    console.log(policies);
  }
}

audit();

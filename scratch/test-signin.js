const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ilduyhuvpiqhvbnocqxf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDgxMzE1NSwiZXhwIjoyMDk2Mzg5MTU1fQ.lRmzrwiuc2oxFTyDepwrLxSI2sYDQShQe3HNLsEhd9w'
);

async function run() {
  console.log("Attempting to sign in with an existing user...");
  // Try to sign in as the user we saw earlier
  const res = await supabase.auth.signInWithPassword({
    email: 'test_return_to@example.com',
    password: 'TestPassword123!'
  });
  console.log("Sign in result error:", res.error ? res.error.message : "Success (no error)");
  console.log("Sign in data:", res.data.user ? "User returned" : "No user");
}
run();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ilduyhuvpiqhvbnocqxf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDgxMzE1NSwiZXhwIjoyMDk2Mzg5MTU1fQ.lRmzrwiuc2oxFTyDepwrLxSI2sYDQShQe3HNLsEhd9w'
);

async function run() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error);
    return;
  }
  
  console.log("Total users:", data.users.length);
  const u = data.users[0];
  console.log("Keys available on user object:", Object.keys(u));
  
  console.log("Sample user confirmation data:");
  console.log("confirmation_token:", u.confirmation_token);
  console.log("confirmation_sent_at:", u.confirmation_sent_at);
}
run();

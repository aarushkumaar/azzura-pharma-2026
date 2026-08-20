const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
sb.auth.signInWithPassword({
  email: 'aarushk0207@gmail.com',
  password: 'AarushLovesfood'
}).then(({ data, error }) => {
  if (error) {
    console.error('Supabase auth failed:', error.message);
  } else {
    console.log('Supabase auth success! User:', data.user.email);
  }
}).catch(err => {
  console.error('Supabase auth exception:', err);
});

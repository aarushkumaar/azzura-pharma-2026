// ============================================================
// AZZURRA — Supabase Client
// NOTE: Only the anon/public key belongs here.
//       NEVER put the service role key or JWT secret in this file.
//       Supabase Row Level Security (RLS) policies protect the data,
//       not the anon key itself.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTMxNTUsImV4cCI6MjA5NjM4OTE1NX0.uuC8dKajsnSSaiTx_wxNeapKPl4EV20s5phcRS-TaZg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Also expose on window so non-module scripts on any page can do:
//   window.supabaseClient.auth.getSession()
window.supabaseClient = supabase;

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

// NOTE: Anon key might not have permission to insert/update if RLS blocks it.
// We can use the service_role key if available, but it's usually not in .env for vite apps.
// We can check if anon key works first.
async function run() {
  const { data: user, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@wifian.net.id', // we don't know the password...
    password: 'password'
  });
  console.log('Auth error?', authErr?.message);
}
run();

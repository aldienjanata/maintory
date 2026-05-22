import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(str => str.trim()))
)

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testLogin() {
  const email = 'superadmin@maintory.local'
  const password = 'super1234'
  
  console.log(`Testing login for ${email}...`)
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  
  if (error) {
    console.error('LOGIN FAILED:')
    console.error(error)
  } else {
    console.log('LOGIN SUCCESS!')
    console.log('User ID:', data.user.id)
  }
}

testLogin()

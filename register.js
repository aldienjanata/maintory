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

async function registerSuperadmin() {
  const email = 'superadmin@maintory.local'
  const password = 'super1234'
  
  console.log(`Mencoba mendaftarkan user ${email}...`)
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: 'superadmin',
        full_name: 'Superadmin',
        role: 'superadmin'
      }
    }
  })
  
  if (error) {
    console.error('GAGAL MENDAFTAR:')
    console.error(error.message)
  } else {
    console.log('BERHASIL! User terdaftar:')
    console.log('ID User:', data.user.id)
    console.log('Silakan coba login kembali di aplikasi.')
  }
}

registerSuperadmin()

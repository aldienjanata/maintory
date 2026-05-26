import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/)
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)
const sb = createClient(urlMatch[1], keyMatch[1])

async function check() {
  const { data: brands, error } = await sb.from('ont_brands').select('*')
  console.log("BRANDS IN DB:", brands)
  
  const { data: types, error: err2 } = await sb.from('ont_types').select('*')
  console.log("TYPES IN DB:", types)
}
check()

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing env vars. Looking in .env...")
  import('fs').then(fs => {
    const env = fs.readFileSync('.env', 'utf8')
    const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/)
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)
    if (urlMatch && keyMatch) {
      const sb = createClient(urlMatch[1], keyMatch[1])
      test(sb)
    }
  })
} else {
  const sb = createClient(supabaseUrl, supabaseKey)
  test(sb)
}

async function test(sb) {
  console.log("Testing insert into ont_brands...")
  const { data: brand, error: err1 } = await sb.from('ont_brands').insert([{ brand_name: 'TEST_BRAND_X' }]).select().single()
  console.log("Brand:", brand, "Error:", err1)

  if (brand) {
    console.log("Testing insert into ont_types...")
    const { data: type, error: err2 } = await sb.from('ont_types').insert([{ brand_id: brand.id, type_name: 'TEST_TYPE_X' }]).select().single()
    console.log("Type:", type, "Error:", err2)
    
    // cleanup
    await sb.from('ont_types').delete().eq('id', type.id)
    await sb.from('ont_brands').delete().eq('id', brand.id)
    console.log("Cleanup done")
  }
}

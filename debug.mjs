import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vjegrddqmzimqkaejhfo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: hs } = await supabase.from('dropcore_haspels').select('id, haspel_code')
  console.log(hs.map(h => h.haspel_code))
}
run()

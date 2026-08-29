import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vjegrddqmzimqkaejhfo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: logs } = await supabase.from('inventory_log').select('item_type').limit(100)
  const types = new Set(logs.map(l => l.item_type))
  console.log('Distinct item_types:', Array.from(types))
}
run()

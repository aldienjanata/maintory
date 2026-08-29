import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vjegrddqmzimqkaejhfo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds'
const supabase = createClient(supabaseUrl, supabaseKey)

async function testInsert(type) {
  const { error } = await supabase.from('inventory_log').insert({
    log_date: '2026-08-29',
    item_type: type,
    item_id: '00000000-0000-0000-0000-000000000000',
    action: 'masuk',
    quantity: 1,
    meters: 0
  })
  console.log('Type', type, 'Error:', error?.message || 'Success')
}

async function run() {
  await testInsert('dropcore')
  await testInsert('Dropcore')
  await testInsert('adss')
  await testInsert('Adss')
  await testInsert('sn')
  await testInsert('stok_gudang')
}
run()

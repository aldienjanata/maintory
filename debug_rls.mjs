import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://vjegrddqmzimqkaejhfo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds')

async function run() {
  // Check RLS
  const { data: hs, error: e1 } = await supabase.from('dropcore_haspels').select('id,haspel_code').limit(5)
  console.log('dropcore_haspels sample:', hs, 'error:', e1?.message)
  
  // Try dispatch_items - are there any dropcore items?
  const { data: di, error: e2 } = await supabase.from('dispatch_items').select('id, item_type, haspel_id, meters_used').eq('item_type','dropcore').limit(5)
  console.log('dispatch_items dropcore:', di, 'error:', e2?.message)
  
  // expense_items
  const { data: ei, error: e3 } = await supabase.from('expense_items').select('id, item_type, haspel_id, meters_used').eq('item_type','dropcore').limit(5)
  console.log('expense_items dropcore:', ei, 'error:', e3?.message)
}
run()

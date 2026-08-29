import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://vjegrddqmzimqkaejhfo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds')

async function run() {
  // RLS is blocking anon key - try fetching without filters  
  const { data: di, count } = await supabase.from('dispatch_items').select('id,item_type', { count: 'exact' }).limit(3)
  console.log('dispatch_items total check:', count, 'sample:', di)
  
  // Check expense_items without filter
  const { data: ei, count: ec } = await supabase.from('expense_items').select('id,item_type,haspel_id,meters_used', { count: 'exact' }).limit(5)
  console.log('expense_items total:', ec, 'sample:', ei)
}
run()

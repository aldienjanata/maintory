import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://vjegrddqmzimqkaejhfo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds')

async function run() {
  // Find H2C-004 haspel
  const { data: hs } = await supabase.from('dropcore_haspels').select('id, haspel_code')
  const target = hs.find(h => h.haspel_code === 'H2C-004')
  if (!target) { console.log('H2C-004 not found'); console.log('Available:', hs.map(h=>h.haspel_code)); return }
  console.log('H2C-004 id:', target.id)

  // Check dispatch_items
  const { data: di } = await supabase.from('dispatch_items').select('*, dispatch:dispatches(dispatch_date, status, site, work_type)').eq('item_type','dropcore').eq('haspel_id', target.id)
  console.log('dispatch_items count:', di?.length)
  di?.forEach(d => console.log(' - dispatch:', d.dispatch?.dispatch_date, 'status:', d.dispatch?.status, 'meters_used:', d.meters_used))
  
  // Check expense_items
  const { data: ei } = await supabase.from('expense_items').select('*, expense:daily_expenses(expense_date, site, note)').eq('item_type','dropcore').eq('haspel_id', target.id)
  console.log('expense_items count:', ei?.length)
  ei?.forEach(e => console.log(' - expense:', e.expense?.expense_date, 'site:', e.expense?.site, 'note:', e.expense?.note, 'meters:', e.meters_used))
}
run()

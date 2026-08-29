import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vjegrddqmzimqkaejhfo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching Dropcore Haspels...')
  const { data: dropcores, error: dErr } = await supabase.from('dropcore_haspels').select('*')
  if (dErr) throw dErr
  
  console.log('Fetching ADSS Haspels...')
  const { data: adss, error: aErr } = await supabase.from('adss_haspels').select('*')
  if (aErr) throw aErr
  
  console.log('Fetching Inventory Logs...')
  const { data: logs, error: lErr } = await supabase.from('inventory_log').select('*').in('action', ['masuk', 'isi_ulang_dropcore', 'isi_ulang_adss'])
  if (lErr) throw lErr
  
  const existingDropcoreLogs = new Set(logs.filter(l => l.item_type === 'dropcore' || l.item_type === 'Dropcore').map(l => l.item_id))
  const existingAdssLogs = new Set(logs.filter(l => l.item_type === 'adss' || l.item_type === 'Adss').map(l => l.item_id))
  
  const toInsert = []
  
  for (const h of dropcores) {
    if (!existingDropcoreLogs.has(h.id)) {
      toInsert.push({
        log_date: h.date_in || h.created_at.substring(0, 10),
        item_type: 'dropcore',
        item_id: h.id,
        action: 'masuk',
        meters: Number(h.initial_meters) || 1000,
        note: h.merk ? 'Merk: ' + h.merk + ' (Suntikan Sistem)' : '(Suntikan Sistem)',
        created_at: h.created_at,
        created_by: h.created_by || null
      })
    }
  }
  
  for (const h of adss) {
    if (!existingAdssLogs.has(h.id)) {
      toInsert.push({
        log_date: h.date_in || h.created_at.substring(0, 10),
        item_type: 'adss',
        item_id: h.id,
        action: 'masuk',
        meters: Number(h.initial_meters) || 4000,
        note: h.brand ? 'Merk: ' + h.brand + ' (Suntikan Sistem)' : '(Suntikan Sistem)',
        created_at: h.created_at,
        created_by: h.created_by || null
      })
    }
  }
  
  console.log('Found ' + toInsert.length + ' haspels missing history.')
  if (toInsert.length > 0) {
    console.log('Inserting...')
    const { error: iErr } = await supabase.from('inventory_log').insert(toInsert)
    if (iErr) {
        console.error('Insert Error:', iErr)
    } else {
        console.log('Successfully injected missing histories!')
    }
  }
}

run().catch(console.error)

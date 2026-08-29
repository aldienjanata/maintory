import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vjegrddqmzimqkaejhfo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZWdyZGRxbXppbXFrYWVqaGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDc3NDAsImV4cCI6MjA5NDkyMzc0MH0.aAA0D6aSkTtYuMTtO8rlOClGRBBq0b37-oaagyhSeds'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.rpc('get_check_constraints')
  console.log('RPC result:', data, error)
}
run()

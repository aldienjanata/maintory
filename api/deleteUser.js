import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing Supabase credentials' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Optional: Delete from public.users first if no cascade setup
    await supabaseAdmin.from('users').delete().eq('id', userId)

    // Delete from Supabase Auth
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authErr) throw authErr

    return res.status(200).json({ message: 'User berhasil dihapus' })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Terjadi kesalahan internal' })
  }
}

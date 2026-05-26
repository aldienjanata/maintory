import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, username, full_name, role } = req.body

  // Pastikan URL dan Service Role Key tersedia di environment
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing Supabase credentials' })
  }

  // Buat admin client menggunakan Service Role Key
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // 1. Buat user di Supabase Auth (melewati email rate limit & auto-confirm)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name, role }
    })

    if (authErr) throw authErr

    // 2. Insert profil user ke tabel public.users
    const { error: dbErr } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      username,
      full_name,
      role,
      is_active: true
    })

    if (dbErr) {
      // Rollback jika insert ke tabel users gagal
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw dbErr
    }

    return res.status(200).json({ message: 'User berhasil dibuat', user: authData.user })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Terjadi kesalahan internal' })
  }
}

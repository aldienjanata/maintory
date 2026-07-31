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
    // Step 1: Hapus dari Supabase Auth terlebih dahulu
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authErr && !authErr.message.toLowerCase().includes('not found')) {
      throw authErr
    }

    // Step 2: Hapus dari public.users (setelah auth sukses atau tidak ada)
    // Nonaktifkan dulu bukan hapus jika ada FK constraint, untuk keamanan
    const { error: dbErr } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (dbErr) {
      // Jika ada foreign key constraint, cukup nonaktifkan akunnya
      if (dbErr.code === '23503' || dbErr.message.includes('foreign key')) {
        const { error: updateErr } = await supabaseAdmin
          .from('users')
          .update({ is_active: false, username: `[deleted]_${userId.slice(0, 8)}`, full_name: '[Akun Dihapus]', updated_at: new Date().toISOString() })
          .eq('id', userId)
        if (updateErr) throw updateErr
        return res.status(200).json({ message: 'Akun berhasil dinonaktifkan (ada data terkait yang tidak bisa dihapus)' })
      }
      throw dbErr
    }

    return res.status(200).json({ message: 'User berhasil dihapus' })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Terjadi kesalahan internal' })
  }
}

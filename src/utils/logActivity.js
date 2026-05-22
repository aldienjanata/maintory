import { supabase } from '../lib/supabase'

export async function logActivity({ userId, username, role, module, action, detail = '' }) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      username,
      role,
      module,
      action,
      detail,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Failed to log activity:', err)
  }
}

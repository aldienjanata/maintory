import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../utils/logActivity'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    // Selalu set user agar tidak mental kembali ke halaman login, 
    // meskipun profil tidak ditemukan (bisa pakai data default)
    setUser({ id: userId })
    
    if (data && !error) {
      setProfile(data)
    } else {
      console.warn('Profile not found in public.users, using fallback', error)
      setProfile({
        id: userId,
        username: 'superadmin',
        full_name: 'Superadmin (Fallback)',
        role: 'superadmin'
      })
    }
    setLoading(false)
  }

  async function login(username, password) {
    // Login via email (email = username@maintory.local)
    const email = `${username}@maintory.local`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) throw new Error(error.message || 'Username atau password salah')

    // Fetch user profile to get role and other details for logging
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

    // Log activity
    if (userData) {
      await logActivity({
        userId: userData.id,
        username: userData.username,
        role: userData.role,
        module: 'Auth',
        action: 'Login berhasil',
        detail: `Login dari aplikasi web`,
      })
    }

    return data
  }

  async function logout() {
    if (profile) {
      await logActivity({
        userId: user.id,
        username: profile.username,
        role: profile.role,
        module: 'Auth',
        action: 'Logout',
        detail: '',
      })
    }
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

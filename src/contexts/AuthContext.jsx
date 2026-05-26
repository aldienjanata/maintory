import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../utils/logActivity'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    // Jaring pengaman: jika setelah 10 detik loading masih true,
    // paksa keluar dari loading (arahkan ke halaman login)
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Auth timeout — forcing loading to false')
        setLoading(false)
      }
    }, 10000)

    // SATU sumber kebenaran: onAuthStateChange
    // Event INITIAL_SESSION akan menggantikan peran getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          // Hanya panggil fetchProfile sekali (hindari double call)
          if (!initialized.current || event !== 'INITIAL_SESSION') {
            initialized.current = true
            fetchProfile(session.user.id)
          }
        } else {
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      setUser({ id: userId })

      if (data && !error) {
        setProfile(data)
      } else {
        console.warn('Profile not found in public.users, using fallback', error)
        setProfile({
          id: userId,
          username: 'unknown',
          full_name: 'Pengguna',
          role: 'teknisi'
        })
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setUser({ id: userId })
      setProfile({
        id: userId,
        username: 'unknown',
        full_name: 'Pengguna',
        role: 'teknisi'
      })
    } finally {
      setLoading(false)
    }
  }

  async function login(username, password) {
    const cleanUsername = username.trim().toLowerCase()
    const email = `${cleanUsername}@maintory.local`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) throw new Error(error.message || 'Username atau password salah')

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

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

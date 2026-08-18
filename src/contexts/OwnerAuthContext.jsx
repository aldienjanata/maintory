import { createContext, useContext, useState, useEffect } from 'react'

const OwnerAuthContext = createContext({})

const OWNER_SESSION_KEY = 'maintory_owner_session'

export function OwnerAuthProvider({ children }) {
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if owner session exists in sessionStorage
    const session = sessionStorage.getItem(OWNER_SESSION_KEY)
    if (session === 'authenticated') {
      setIsOwner(true)
    }
    setLoading(false)
  }, [])

  const ownerLogin = (password) => {
    const ownerPassword = import.meta.env.VITE_OWNER_PASSWORD || 'Maintorybyaldi@2026'
    if (password === ownerPassword) {
      sessionStorage.setItem(OWNER_SESSION_KEY, 'authenticated')
      setIsOwner(true)
      return true
    }
    return false
  }

  const ownerLogout = () => {
    sessionStorage.removeItem(OWNER_SESSION_KEY)
    setIsOwner(false)
  }

  return (
    <OwnerAuthContext.Provider value={{ isOwner, loading, ownerLogin, ownerLogout }}>
      {children}
    </OwnerAuthContext.Provider>
  )
}

export const useOwnerAuth = () => useContext(OwnerAuthContext)

import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({})

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('maintory-theme')
    return saved !== null ? saved === 'dark' : true // default dark
  })

  useEffect(() => {
    localStorage.setItem('maintory-theme', isDark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = () => setIsDark(prev => !prev)

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

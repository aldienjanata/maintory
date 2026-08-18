import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

const ThemeContext = createContext({})

// Design model CSS variable definitions
const DESIGN_MODELS = {
  dark_pro: {
    '--bg-primary': '#0d1117',
    '--bg-secondary': '#161b22',
    '--bg-card': '#1c2128',
    '--bg-hover': '#21262d',
    '--accent': '#00a3ff',
    '--accent-hover': '#0090e0',
    '--text-primary': '#e6edf3',
    '--text-secondary': '#8b949e',
    '--text-muted': '#6e7681',
    '--border': '#30363d',
    '--border-light': '#21262d',
    '--shadow': '0 4px 20px rgba(0,0,0,0.4)',
    '--radius': '10px',
    '--radius-sm': '6px',
    '--sidebar-bg': '#0d1117',
    '--card-blur': 'none',
    '--card-opacity': '1',
  },
  glassmorphism: {
    '--bg-primary': '#0a0e1a',
    '--bg-secondary': 'rgba(255,255,255,0.05)',
    '--bg-card': 'rgba(255,255,255,0.08)',
    '--bg-hover': 'rgba(255,255,255,0.12)',
    '--accent': '#7c6ffa',
    '--accent-hover': '#6a5ef0',
    '--text-primary': '#ffffff',
    '--text-secondary': 'rgba(255,255,255,0.65)',
    '--text-muted': 'rgba(255,255,255,0.4)',
    '--border': 'rgba(255,255,255,0.15)',
    '--border-light': 'rgba(255,255,255,0.08)',
    '--shadow': '0 8px 32px rgba(0,0,0,0.5)',
    '--radius': '16px',
    '--radius-sm': '10px',
    '--sidebar-bg': 'rgba(255,255,255,0.04)',
    '--card-blur': 'blur(12px)',
    '--card-opacity': '0.85',
  },
  corporate: {
    '--bg-primary': '#f4f6f9',
    '--bg-secondary': '#ffffff',
    '--bg-card': '#ffffff',
    '--bg-hover': '#f0f2f5',
    '--accent': '#1a56db',
    '--accent-hover': '#1648c0',
    '--text-primary': '#1e2939',
    '--text-secondary': '#4b5563',
    '--text-muted': '#9ca3af',
    '--border': '#e5e7eb',
    '--border-light': '#f3f4f6',
    '--shadow': '0 2px 12px rgba(0,0,0,0.08)',
    '--radius': '8px',
    '--radius-sm': '4px',
    '--sidebar-bg': '#1e2939',
    '--card-blur': 'none',
    '--card-opacity': '1',
  },
  neon_cyber: {
    '--bg-primary': '#040a0f',
    '--bg-secondary': '#080f18',
    '--bg-card': '#0c1520',
    '--bg-hover': '#111e2c',
    '--accent': '#00ff88',
    '--accent-hover': '#00e077',
    '--text-primary': '#e0ffe8',
    '--text-secondary': '#5affaa',
    '--text-muted': '#2d7a50',
    '--border': '#00ff8830',
    '--border-light': '#00ff8815',
    '--shadow': '0 4px 24px rgba(0,255,136,0.15)',
    '--radius': '4px',
    '--radius-sm': '2px',
    '--sidebar-bg': '#040a0f',
    '--card-blur': 'none',
    '--card-opacity': '1',
  },
  soft_minimal: {
    '--bg-primary': '#fafafa',
    '--bg-secondary': '#ffffff',
    '--bg-card': '#ffffff',
    '--bg-hover': '#f5f5f5',
    '--accent': '#f97316',
    '--accent-hover': '#ea6c0f',
    '--text-primary': '#292524',
    '--text-secondary': '#78716c',
    '--text-muted': '#a8a29e',
    '--border': '#e7e5e4',
    '--border-light': '#f5f5f4',
    '--shadow': '0 1px 8px rgba(0,0,0,0.06)',
    '--radius': '20px',
    '--radius-sm': '12px',
    '--sidebar-bg': '#ffffff',
    '--card-blur': 'none',
    '--card-opacity': '1',
  },
}

const FONT_MAP = {
  'Inter': "'Inter', sans-serif",
  'Poppins': "'Poppins', sans-serif",
  'Roboto': "'Roboto', sans-serif",
  'Space Grotesk': "'Space Grotesk', sans-serif",
  'JetBrains Mono': "'JetBrains Mono', monospace",
}

function applyTheme(model, accentColor, fontFamily) {
  const root = document.documentElement
  const vars = DESIGN_MODELS[model] || DESIGN_MODELS.dark_pro

  // Apply all CSS variables
  Object.entries(vars).forEach(([key, value]) => {
    // Override accent if custom color set
    if (key === '--accent' && accentColor && accentColor !== '#00a3ff') {
      root.style.setProperty(key, accentColor)
    } else {
      root.style.setProperty(key, value)
    }
  })

  // Apply font
  if (fontFamily && FONT_MAP[fontFamily]) {
    root.style.setProperty('--font-family', FONT_MAP[fontFamily])
    // Dynamically load Google Font
    const existingLink = document.getElementById('dynamic-font')
    if (existingLink) existingLink.remove()
    if (fontFamily !== 'Inter') {
      const link = document.createElement('link')
      link.id = 'dynamic-font'
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }

  // Apply backdrop-filter for glassmorphism
  root.style.setProperty('--card-filter', vars['--card-blur'] || 'none')
  
  // Set data-model attribute for CSS targeting
  root.setAttribute('data-model', model)
}

export function ThemeProvider({ children }) {
  const [designModel, setDesignModel] = useState('dark_pro')
  const [accentColor, setAccentColor] = useState('#00a3ff')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    // Load initial settings from Supabase
    supabase.from('app_settings').select('design_model, accent_color, font_family').single()
      .then(({ data }) => {
        if (data) {
          const model = data.design_model || 'dark_pro'
          const accent = data.accent_color || '#00a3ff'
          const font = data.font_family || 'Inter'
          setDesignModel(model)
          setAccentColor(accent)
          setFontFamily(font)
          applyTheme(model, accent, font)
          // Determine dark/light
          setIsDark(!['corporate', 'soft_minimal'].includes(model))
        } else {
          applyTheme('dark_pro', '#00a3ff', 'Inter')
        }
      })

    // Subscribe to real-time changes from owner panel
    const channel = supabase.channel('theme-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'app_settings',
      }, (payload) => {
        const { design_model, accent_color, font_family } = payload.new
        if (design_model) setDesignModel(design_model)
        if (accent_color) setAccentColor(accent_color)
        if (font_family) setFontFamily(font_family)
        applyTheme(
          design_model || designModel,
          accent_color || accentColor,
          font_family || fontFamily
        )
        setIsDark(!['corporate', 'soft_minimal'].includes(design_model))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const toggleTheme = () => {
    const newModel = isDark ? 'corporate' : 'dark_pro'
    setIsDark(!isDark)
    setDesignModel(newModel)
    applyTheme(newModel, accentColor, fontFamily)
  }

  return (
    <ThemeContext.Provider value={{
      isDark, toggleTheme,
      designModel, accentColor, fontFamily,
      DESIGN_MODELS, FONT_MAP, applyTheme
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
export { DESIGN_MODELS, applyTheme }

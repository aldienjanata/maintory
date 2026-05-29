import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { ProgressProvider } from './contexts/ProgressContext.jsx'
import UpdatePrompt from './components/UpdatePrompt.jsx'
import './index.css'

// Animasi slide-up untuk banner update
const style = document.createElement('style')
style.textContent = `@keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ProgressProvider>
          <App />
          <UpdatePrompt />
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            },
            success: {
              iconTheme: {
                primary: 'var(--success)',
                secondary: 'white',
              },
            },
            error: {
              iconTheme: {
                primary: 'var(--danger)',
                secondary: 'white',
              },
            },
          }}
        />
        </ProgressProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

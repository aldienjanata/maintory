import { createContext, useContext, useState } from 'react'

const ProgressContext = createContext()

export function ProgressProvider({ children }) {
  const [progress, setProgress] = useState({ show: false, title: '', percent: 0, description: '' })

  const showProgress = (title, description, percent = 0) => {
    setProgress({ show: true, title, description, percent })
  }

  const hideProgress = () => {
    setProgress(p => ({ ...p, show: false }))
  }

  return (
    <ProgressContext.Provider value={{ showProgress, hideProgress, progress }}>
      {children}
      {progress.show && (
        <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{progress.title}</h3>
            {progress.description && (
              <p className="text-secondary" style={{ fontSize: '13px', marginBottom: '20px' }}>{progress.description}</p>
            )}
            <div style={{ background: 'var(--border-light)', borderRadius: '10px', height: '14px', overflow: 'hidden', marginBottom: '12px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ 
                background: 'linear-gradient(90deg, var(--accent) 0%, #3b82f6 100%)', 
                height: '100%', 
                width: `${Math.min(100, Math.max(0, progress.percent))}%`, 
                transition: 'width 0.2s ease-out' 
              }} />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent)' }}>
              {Math.round(progress.percent)}%
            </div>
          </div>
        </div>
      )}
    </ProgressContext.Provider>
  )
}

export function useProgress() {
  return useContext(ProgressContext)
}

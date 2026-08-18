import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Palette, Type, Check, Eye, Zap } from 'lucide-react'
import { DESIGN_MODELS, applyTheme } from '../../../ThemeContext'

const FONTS = ['Inter', 'Poppins', 'Roboto', 'Space Grotesk', 'JetBrains Mono']

const MODEL_META = {
  dark_pro: {
    name: 'Dark Pro',
    desc: 'Navy gelap, aksen biru, tampilan profesional saat ini',
    emoji: '🌙',
    preview: {
      bg: '#0d1117', card: '#1c2128', accent: '#00a3ff',
      text: '#e6edf3', border: '#30363d', radius: '10px'
    }
  },
  glassmorphism: {
    name: 'Glassmorphism',
    desc: 'Efek kaca transparan, blur, modern & elegan',
    emoji: '🔮',
    preview: {
      bg: '#0a0e1a', card: 'rgba(255,255,255,0.08)', accent: '#7c6ffa',
      text: '#ffffff', border: 'rgba(255,255,255,0.15)', radius: '16px'
    }
  },
  corporate: {
    name: 'Corporate',
    desc: 'Putih bersih, profesional, enterprise-grade',
    emoji: '🏢',
    preview: {
      bg: '#f4f6f9', card: '#ffffff', accent: '#1a56db',
      text: '#1e2939', border: '#e5e7eb', radius: '8px'
    }
  },
  neon_cyber: {
    name: 'Neon Cyber',
    desc: 'Hitam pekat, neon hijau, gaya cyberpunk',
    emoji: '⚡',
    preview: {
      bg: '#040a0f', card: '#0c1520', accent: '#00ff88',
      text: '#e0ffe8', border: '#00ff8830', radius: '4px'
    }
  },
  soft_minimal: {
    name: 'Soft Minimal',
    desc: 'Pastel lembut, rounded, tampilan sangat bersih',
    emoji: '🌸',
    preview: {
      bg: '#fafafa', card: '#ffffff', accent: '#f97316',
      text: '#292524', border: '#e7e5e4', radius: '20px'
    }
  },
}

// Mini mockup component to show preview
function ModelPreview({ model, accentColor, fontFamily, isLive = false }) {
  const meta = MODEL_META[model]
  const p = meta.preview
  const accent = accentColor || p.accent

  return (
    <div style={{
      background: p.bg,
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${p.border}`,
      fontFamily: fontFamily ? `${fontFamily}, sans-serif` : 'inherit',
      position: 'relative',
    }}>
      {isLive && (
        <div style={{
          position: 'absolute', top: '6px', right: '6px',
          background: '#10b981', color: '#fff',
          fontSize: '9px', fontWeight: 700, padding: '2px 6px',
          borderRadius: '4px', zIndex: 1,
        }}>LIVE</div>
      )}
      {/* Fake sidebar */}
      <div style={{ display: 'flex', height: '180px' }}>
        <div style={{
          width: '56px', background: p.model === 'corporate' ? '#1e2939' : p.bg,
          borderRight: `1px solid ${p.border}`,
          padding: '10px 8px',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ width: '24px', height: '24px', borderRadius: p.radius, background: accent, opacity: 0.9 }} />
          {[0.4, 0.3, 0.3, 0.25].map((op, i) => (
            <div key={i} style={{
              width: '24px', height: '6px', borderRadius: '3px',
              background: p.text, opacity: op,
            }} />
          ))}
        </div>
        {/* Main content */}
        <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Header */}
          <div style={{
            height: '24px', borderRadius: p.radius,
            background: p.card, border: `1px solid ${p.border}`,
            display: 'flex', alignItems: 'center', paddingLeft: '8px', gap: '6px',
          }}>
            <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: accent }} />
            <div style={{ width: '30px', height: '4px', borderRadius: '3px', background: p.text, opacity: 0.3, marginLeft: 'auto', marginRight: '8px' }} />
          </div>
          {/* Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', flex: 1 }}>
            {[accent, '#10b981', '#f97316'].map((c, i) => (
              <div key={i} style={{
                background: p.card,
                border: `1px solid ${p.border}`,
                borderRadius: p.radius,
                padding: '6px',
                backdropFilter: model === 'glassmorphism' ? 'blur(8px)' : 'none',
              }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: `${c}30`, marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: c }} />
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: p.text, opacity: 0.4, marginBottom: '3px' }} />
                <div style={{ width: '60%', height: '4px', borderRadius: '2px', background: p.text, opacity: 0.2 }} />
              </div>
            ))}
          </div>
          {/* Table row */}
          <div style={{
            background: p.card, border: `1px solid ${p.border}`,
            borderRadius: p.radius, padding: '6px 8px',
            display: 'flex', gap: '8px', alignItems: 'center',
          }}>
            {[1, 0.6, 0.4, 0.3].map((op, i) => (
              <div key={i} style={{ flex: 1, height: '5px', borderRadius: '2px', background: p.text, opacity: op }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DesignManager() {
  const [currentModel, setCurrentModel] = useState('dark_pro')
  const [currentAccent, setCurrentAccent] = useState('#00a3ff')
  const [currentFont, setCurrentFont] = useState('Inter')

  // Preview state (not yet applied)
  const [previewModel, setPreviewModel] = useState(null)
  const [previewAccent, setPreviewAccent] = useState(null)
  const [previewFont, setPreviewFont] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Active preview values
  const activeModel = previewModel || currentModel
  const activeAccent = previewAccent || currentAccent
  const activeFont = previewFont || currentFont
  const hasChanges = previewModel || previewAccent || previewFont

  useEffect(() => {
    // Load current settings
    supabase.from('app_settings').select('design_model, accent_color, font_family').single()
      .then(({ data }) => {
        if (data) {
          setCurrentModel(data.design_model || 'dark_pro')
          setCurrentAccent(data.accent_color || '#00a3ff')
          setCurrentFont(data.font_family || 'Inter')
        }
      })
  }, [])

  const handleApply = async () => {
    setSaving(true)
    try {
      // Apply to DOM immediately (preview)
      applyTheme(activeModel, activeAccent, activeFont)

      // Save to Supabase (will broadcast to all users via realtime)
      const { error } = await supabase
        .from('app_settings')
        .update({
          design_model: activeModel,
          accent_color: activeAccent,
          font_family: activeFont,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)

      if (error) throw error

      // Commit preview to current
      setCurrentModel(activeModel)
      setCurrentAccent(activeAccent)
      setCurrentFont(activeFont)
      setPreviewModel(null)
      setPreviewAccent(null)
      setPreviewFont(null)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPreviewModel(null)
    setPreviewAccent(null)
    setPreviewFont(null)
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '20px',
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>

      {/* Left: Controls */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

        {/* Design Models */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Palette size={16} color="#00a3ff" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Model Desain Web</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {Object.entries(MODEL_META).map(([key, meta]) => {
              const isSelected = activeModel === key
              const isCurrent = currentModel === key
              return (
                <button
                  key={key}
                  onClick={() => setPreviewModel(key === currentModel && !previewAccent && !previewFont ? null : key)}
                  style={{
                    padding: '12px',
                    background: isSelected ? 'rgba(0,163,255,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(0,163,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '10px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px' }}>{meta.emoji}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {isCurrent && (
                        <span style={{
                          fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                          background: 'rgba(16,185,129,0.2)', color: '#10b981', fontWeight: 700,
                        }}>AKTIF</span>
                      )}
                      {isSelected && (
                        <Check size={14} color="#00a3ff" />
                      )}
                    </div>
                  </div>
                  <div style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>{meta.name}</div>
                  <div style={{ color: '#6e7681', fontSize: '11px', marginTop: '2px', lineHeight: 1.4 }}>{meta.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Accent Color */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Zap size={16} color="#f97316" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Warna Aksen</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="color"
              value={previewAccent || currentAccent}
              onChange={e => setPreviewAccent(e.target.value)}
              style={{
                width: '52px', height: '52px',
                border: '2px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', cursor: 'pointer',
                background: 'none', padding: '2px',
              }}
            />
            <div>
              <div style={{ color: '#e6edf3', fontSize: '14px', fontWeight: 600 }}>
                {(previewAccent || currentAccent).toUpperCase()}
              </div>
              <div style={{ color: '#6e7681', fontSize: '12px', marginTop: '4px' }}>
                Warna aksen digunakan untuk tombol, link, highlight aktif
              </div>
            </div>
            {/* Preset colors */}
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap', maxWidth: '140px' }}>
              {['#00a3ff','#7c6ffa','#10b981','#f97316','#ef4444','#ec4899','#00ff88','#facc15'].map(c => (
                <button
                  key={c}
                  onClick={() => setPreviewAccent(c)}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: c, border: `2px solid ${(previewAccent || currentAccent) === c ? '#fff' : 'transparent'}`,
                    cursor: 'pointer', transition: 'transform 0.15s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Font Family */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Type size={16} color="#8b5cf6" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Jenis Font</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {FONTS.map(f => {
              const isSelected = (previewFont || currentFont) === f
              return (
                <button
                  key={f}
                  onClick={() => setPreviewFont(f)}
                  style={{
                    padding: '10px 14px',
                    background: isSelected ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '8px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{
                    fontFamily: `${f}, sans-serif`,
                    color: '#e6edf3', fontSize: '15px',
                  }}>
                    {f} — Maintory
                  </span>
                  {isSelected && <Check size={14} color="#8b5cf6" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Live Preview + Apply */}
      <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ ...cardStyle, position: 'sticky', top: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Eye size={16} color="#10b981" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Preview</span>
            {hasChanges && (
              <span style={{
                marginLeft: 'auto', fontSize: '10px', padding: '2px 6px',
                background: 'rgba(249,115,22,0.15)', color: '#f97316',
                borderRadius: '4px', fontWeight: 700,
              }}>BELUM DITERAPKAN</span>
            )}
          </div>

          {/* Model info */}
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '20px' }}>{MODEL_META[activeModel].emoji}</span>
            <div>
              <div style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>{MODEL_META[activeModel].name}</div>
              <div style={{ color: '#6e7681', fontSize: '11px' }}>Font: {activeFont}</div>
            </div>
          </div>

          {/* Mini preview */}
          <ModelPreview
            model={activeModel}
            accentColor={activeAccent}
            fontFamily={activeFont}
          />

          {/* Action buttons */}
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleApply}
              disabled={saving || !hasChanges}
              style={{
                width: '100%', padding: '12px',
                background: hasChanges
                  ? 'linear-gradient(135deg, #00a3ff, #0077cc)'
                  : 'rgba(255,255,255,0.05)',
                border: 'none', borderRadius: '8px',
                color: hasChanges ? '#fff' : '#6e7681',
                fontSize: '13px', fontWeight: 700,
                cursor: hasChanges ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {saving ? (
                <>
                  <div style={{
                    width: '14px', height: '14px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Menerapkan ke semua user...
                </>
              ) : saved ? (
                '✓ Berhasil Diterapkan!'
              ) : (
                <>✨ Terapkan ke Semua User</>
              )}
            </button>

            {hasChanges && (
              <button
                onClick={handleReset}
                style={{
                  width: '100%', padding: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  color: '#8b949e', fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                ↩ Batalkan Perubahan
              </button>
            )}
          </div>

          {saved && (
            <div style={{
              marginTop: '10px', padding: '10px', borderRadius: '8px',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
              color: '#10b981', fontSize: '12px', textAlign: 'center',
            }}>
              🎉 Desain sudah diterapkan ke semua user secara realtime!
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

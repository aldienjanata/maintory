# Selamat Datang di Dokumen Belajar Maintory! 🎓

Folder `docs-belajar/` ini secara khusus dibuat untuk Anda, *developer* Maintory, agar bisa **benar-benar memahami** apa yang terjadi di balik layar aplikasi ini. Jika sebelumnya Anda lebih sering mengandalkan AI untuk membuatkan kode, dokumen ini akan membantu Anda membaca, memahami, dan memelihara kode tersebut secara mandiri.

## Tentang Maintory
Maintory adalah aplikasi web Single Page Application (SPA) yang dirancang untuk mengelola tiket maintenance, inventaris material (Kabel, ONT, dll), hingga pemetaan data jaringan ODP/ODC untuk sebuah perusahaan Internet Service Provider (ISP). Aplikasi ini sepenuhnya berjalan di *frontend* (menggunakan React) yang di-hosting di Vercel, dan berkomunikasi langsung dengan database PostgreSQL melalui Supabase.

---

## 🗺️ Peta Dokumentasi

| File | Topik Utama | Tujuan Membaca | Kapan Harus Dibaca? |
|------|-------------|----------------|---------------------|
| [01-arsitektur.md](./01-arsitektur.md) | **Arsitektur & Struktur** | Memahami dari mana alur data bermula, fungsi tiap folder, dan kenapa kita memakai stack Vite + Supabase + Vercel. | 📌 Mulai dari sini (Langkah Pertama). |
| [06-fondasi-belajar.md](./06-fondasi-belajar.md) | **Konsep Fundamental** | Mempelajari 8 konsep *programming* inti yang sering muncul di kode Maintory (State, JWT, Context, Async/Await). | 🧠 Setelah membaca Arsitektur. Paling penting untuk belajar. |
| [03-fitur-fitur.md](./03-fitur-fitur.md) | **Daftar Fitur App** | Mengetahui alur data tiap fitur (misal: fitur Excel itu file-nya di mana) dan kelemahan UI yang masih ada. | 🔍 Saat Anda ingin memodifikasi/menambah fitur baru. |
| [02-keamanan-security.md](./02-keamanan-security.md) | **Audit & Keamanan** | Mengenali bahaya variabel lingkungan (env vars), cara kerja RLS, dan celah keamanan di aplikasi saat ini. | 🛡️ Sangat penting! Baca sebelum data perusahaan bocor. |
| [04-maintenance-troubleshooting.md](./04-maintenance-troubleshooting.md) | **Solusi Masalah (Debug)** | Buku panduan medis saat web tiba-tiba *down*, Supabase ter-pause, atau Vercel gagal deploy. Serta cara Backup. | 🚑 Saat aplikasi sedang error/bermasalah. |
| [05-kelebihan-kekurangan.md](./05-kelebihan-kekurangan.md) | **Analisis Kelemahan** | Menyadari keterbatasan Tier Gratis, dan apa yang harus dilakukan jika user bertambah hingga ratusan teknisi. | 📈 Saat perusahaan mulai bergantung penuh pada aplikasi ini. |

---

## 🧭 Urutan Membaca yang Disarankan

*   **Untuk Pemula Total (Ingin Memahami Kodenya):**
    Baca `01-arsitektur.md` ➔ lalu fokus habis-habisan di `06-fondasi-belajar.md`.
*   **Jika Anda Takut Webnya Kena Hack:**
    Baca `02-keamanan-security.md` ➔ pastikan RLS Anda nyala!
*   **Jika Web Anda Sedang Mati / Blank Layar Putih:**
    Langsung loncat ke `04-maintenance-troubleshooting.md`.

---

## ⚡ Quick Reference (Tanya Jawab Cepat)

*   *"Kenapa web saya blank putih?"* ➔ Lihat [04-maintenance-troubleshooting.md](./04-maintenance-troubleshooting.md)
*   *"Apakah data kantor saya aman?"* ➔ Lihat [02-keamanan-security.md](./02-keamanan-security.md)
*   *"Saya bingung baca kodingan useEffect & useState"* ➔ Lihat [06-fondasi-belajar.md](./06-fondasi-belajar.md)
*   *"Web ini maksimal bisa nampung berapa data?"* ➔ Lihat [05-kelebihan-kekurangan.md](./05-kelebihan-kekurangan.md)
*   *"Kalo mau edit fitur Excel, cari di mana ya?"* ➔ Lihat [03-fitur-fitur.md](./03-fitur-fitur.md)

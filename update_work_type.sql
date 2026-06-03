-- ============================================================
-- SQL SCRIPT: Menambahkan Jenis Pekerjaan ODC/ODP
-- Jalankan script ini di Supabase > SQL Editor
-- ============================================================

-- Menghapus batasan (constraint) tipe pekerjaan agar lebih fleksibel
ALTER TABLE daily_schedules DROP CONSTRAINT IF EXISTS daily_schedules_work_type_check;
ALTER TABLE daily_expenses DROP CONSTRAINT IF EXISTS daily_expenses_work_type_check;

-- Kita tidak perlu menambahkan constraint baru agar sistem bisa menerima jenis pekerjaan baru tanpa error.

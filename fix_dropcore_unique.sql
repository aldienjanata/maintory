-- Hapus constraint unique pada haspel_code di tabel dropcore_haspels
-- Ini diperlukan agar fitur "Re-use Haspel Code" (menggunakan ulang kode haspel yang sudah habis untuk stok baru) bisa berjalan

ALTER TABLE public.dropcore_haspels DROP CONSTRAINT IF EXISTS dropcore_haspels_haspel_code_key;

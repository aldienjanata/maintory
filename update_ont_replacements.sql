-- ============================================================
-- SQL SCRIPT: Menambahkan Kolom Lokasi (site) di Pergantian ONT
-- Jalankan script ini di Supabase > SQL Editor
-- ============================================================

ALTER TABLE ont_replacements 
ADD COLUMN IF NOT EXISTS site TEXT CHECK (site IN ('banyumas', 'cilacap', 'cilacap_herman')) DEFAULT 'banyumas';


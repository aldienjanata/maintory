-- =====================================================
-- MIGRATION: Barcode Scanner Tables
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- Tabel Scan Permanen (Tab 1)
CREATE TABLE IF NOT EXISTS public.barcode_scans (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode     text NOT NULL UNIQUE,
  note        text,
  category    text DEFAULT 'umum',
  scanned_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_scan  timestamptz NOT NULL DEFAULT now(),
  last_scan   timestamptz NOT NULL DEFAULT now(),
  scan_count  int NOT NULL DEFAULT 1,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.barcode_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access_barcode_scans"
  ON public.barcode_scans FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_barcode_scans_barcode ON public.barcode_scans(barcode);
CREATE INDEX IF NOT EXISTS idx_barcode_scans_first_scan ON public.barcode_scans(first_scan DESC);
CREATE INDEX IF NOT EXISTS idx_barcode_scans_last_scan ON public.barcode_scans(last_scan DESC);

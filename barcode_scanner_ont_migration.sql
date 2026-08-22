-- Add ONT specific columns to barcode_scans
ALTER TABLE public.barcode_scans ADD COLUMN IF NOT EXISTS ont_kondisi text;
ALTER TABLE public.barcode_scans ADD COLUMN IF NOT EXISTS ont_asal text;
ALTER TABLE public.barcode_scans ADD COLUMN IF NOT EXISTS ont_asal_detail text;
ALTER TABLE public.barcode_scans ADD COLUMN IF NOT EXISTS ont_tujuan text;
ALTER TABLE public.barcode_scans ADD COLUMN IF NOT EXISTS ont_tujuan_detail text;

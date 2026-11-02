-- Fix: Pastikan semua OTB 96 Core (OTB 96 Core 1 & Core 2) memiliki rows_count = 4, cols_count = 24
-- Jalankan di Supabase SQL Editor jika baris OTB 96 Core 2 masih tampil terbalik

-- Cek dulu data sebelum diupdate:
SELECT id, site, name, device_type, rows_count, cols_count, total_ports 
FROM server_devices 
WHERE device_type = 'otb' AND site = 'banyumas';

-- Update OTB 96 Core 2 (dan Core 1) agar rows_count = 4, cols_count = 24
UPDATE server_devices
SET rows_count = 4, cols_count = 24, total_ports = 96
WHERE site = 'banyumas'
  AND device_type = 'otb'
  AND total_ports = 96;

-- Cek ulang setelah update:
SELECT id, site, name, device_type, rows_count, cols_count, total_ports 
FROM server_devices 
WHERE device_type = 'otb' AND site = 'banyumas';

-- ========================================================
-- UPDATE PENOMORAN & POSISI BARIS OTB 144
-- ========================================================
-- Mengatur susunan port OTB 144:
-- Baris 12 (paling atas)  : Port No 1 s/d No 12
-- Baris 11                : Port No 13 s/d No 24
-- Baris 10                : Port No 25 s/d No 36
-- Baris 9                 : Port No 37 s/d No 48
-- Baris 8                 : Port No 49 s/d No 60
-- Baris 7                 : Port No 61 s/d No 72
-- Baris 6                 : Port No 73 s/d No 84
-- Baris 5                 : Port No 85 s/d No 96
-- Baris 4                 : Port No 97 s/d No 108
-- Baris 3                 : Port No 109 s/d No 120
-- Baris 2                 : Port No 121 s/d No 132
-- Baris 1 (paling bawah)  : Port No 133 s/d No 144

-- 1. Update row_number dan col_number untuk OTB 144
UPDATE public.server_ports
SET 
  row_number = 13 - CEIL(port_number / 12.0),
  col_number = ((port_number - 1) % 12) + 1
WHERE device_id IN (
  SELECT id FROM public.server_devices 
  WHERE total_ports = 144 OR name ILIKE '%144%'
);

-- 2. Cek sampel hasil update OTB 144
SELECT 
  d.name AS device_name,
  p.port_label,
  p.port_number,
  p.row_number,
  p.col_number,
  p.status
FROM public.server_ports p
JOIN public.server_devices d ON d.id = p.device_id
WHERE d.total_ports = 144 OR d.name ILIKE '%144%'
ORDER BY p.row_number DESC, p.col_number ASC
LIMIT 30;

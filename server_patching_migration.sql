-- =====================================================
-- MIGRATION: Server Patching & Cross-Connect (OLT - OTB)
-- Jalankan file ini di Supabase SQL Editor
-- =====================================================

-- 1. TABEL PERANGKAT SERVER (OLT, OTB, Switch, dll)
CREATE TABLE IF NOT EXISTS public.server_devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site text NOT NULL DEFAULT 'banyumas',
  name text NOT NULL,
  device_type text NOT NULL, -- 'olt', 'otb', 'switch', 'router'
  brand_model text,
  total_ports int NOT NULL DEFAULT 0,
  rows_count int DEFAULT 1,
  cols_count int DEFAULT 1,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. TABEL PORT PERANGKAT
CREATE TABLE IF NOT EXISTS public.server_ports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.server_devices(id) ON DELETE CASCADE,
  slot_number int,        -- Untuk OLT (misal slot 3)
  port_number int NOT NULL, -- Nomor urut port
  row_number int,         -- Baris (untuk OTB)
  col_number int,         -- Kolom (untuk OTB)
  port_label text NOT NULL, -- Misal 'PON 3/1', 'Baris 4 No 15', 'No 109'
  status text NOT NULL DEFAULT 'available', -- 'available', 'connected', 'faulty'
  note text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_device_port UNIQUE (device_id, port_label)
);

-- 3. TABEL RELASI KONEKSI (CROSS-CONNECT / JUMPER DUA ARAH)
CREATE TABLE IF NOT EXISTS public.server_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  port_a_id uuid NOT NULL REFERENCES public.server_ports(id) ON DELETE CASCADE UNIQUE,
  port_b_id uuid NOT NULL REFERENCES public.server_ports(id) ON DELETE CASCADE UNIQUE,
  cable_type text DEFAULT 'Patchcord SC-SC',
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS POLICIES
ALTER TABLE public.server_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_ports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_server_devices') THEN
    CREATE POLICY auth_all_server_devices ON public.server_devices FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_server_ports') THEN
    CREATE POLICY auth_all_server_ports ON public.server_ports FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_all_server_connections') THEN
    CREATE POLICY auth_all_server_connections ON public.server_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- INDEXING
CREATE INDEX IF NOT EXISTS idx_server_ports_device ON public.server_ports(device_id);
CREATE INDEX IF NOT EXISTS idx_server_ports_status ON public.server_ports(status);
CREATE INDEX IF NOT EXISTS idx_server_conn_port_a ON public.server_connections(port_a_id);
CREATE INDEX IF NOT EXISTS idx_server_conn_port_b ON public.server_connections(port_b_id);

-- =====================================================
-- SEED DATA (PERANGKAT & PORT)
-- =====================================================

-- 1. Insert 4 Devices
INSERT INTO public.server_devices (id, site, name, device_type, brand_model, total_ports, rows_count, cols_count, description)
VALUES 
  ('e0000000-0000-0000-0000-000000000001', 'banyumas', 'OLT ZTE C300', 'olt', 'ZTE C300', 112, 14, 8, 'OLT Utama Ruang Server (Slot 3-16, PON Ports)'),
  ('e0000000-0000-0000-0000-000000000002', 'banyumas', 'OTB 96 Core 1', 'otb', 'OTB 96 Core Rackmount', 96, 4, 24, 'OTB 96 Core #1 (4 Baris x 24 Port)'),
  ('e0000000-0000-0000-0000-000000000003', 'banyumas', 'OTB 96 Core 2', 'otb', 'OTB 96 Core Rackmount', 96, 4, 24, 'OTB 96 Core #2 (4 Baris x 24 Port)'),
  ('e0000000-0000-0000-0000-000000000004', 'banyumas', 'OTB 144 Core', 'otb', 'OTB 144 Core Rackmount', 144, 12, 12, 'OTB 144 Core (12 Baris x 12 Port / No 1-144)')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  brand_model = EXCLUDED.brand_model,
  total_ports = EXCLUDED.total_ports,
  rows_count = EXCLUDED.rows_count,
  cols_count = EXCLUDED.cols_count;

-- 2. Insert Ports for OTB 96 Core 1 (4 rows x 24 cols)
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 1, 1, 'Baris 1 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 2, 2, 'Baris 1 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 3, 3, 'Baris 1 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 4, 4, 'Baris 1 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 5, 5, 'Baris 1 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 6, 6, 'Baris 1 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 7, 7, 'Baris 1 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 8, 8, 'Baris 1 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 9, 9, 'Baris 1 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 10, 10, 'Baris 1 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 11, 11, 'Baris 1 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 12, 12, 'Baris 1 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 13, 13, 'Baris 1 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 14, 14, 'Baris 1 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 15, 15, 'Baris 1 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 16, 16, 'Baris 1 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 17, 17, 'Baris 1 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 18, 18, 'Baris 1 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 19, 19, 'Baris 1 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 20, 20, 'Baris 1 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 21, 21, 'Baris 1 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 22, 22, 'Baris 1 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 23, 23, 'Baris 1 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 24, 24, 'Baris 1 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 1, 25, 'Baris 2 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 2, 26, 'Baris 2 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 3, 27, 'Baris 2 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 4, 28, 'Baris 2 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 5, 29, 'Baris 2 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 6, 30, 'Baris 2 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 7, 31, 'Baris 2 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 8, 32, 'Baris 2 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 9, 33, 'Baris 2 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 10, 34, 'Baris 2 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 11, 35, 'Baris 2 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 12, 36, 'Baris 2 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 13, 37, 'Baris 2 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 14, 38, 'Baris 2 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 15, 39, 'Baris 2 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 16, 40, 'Baris 2 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 17, 41, 'Baris 2 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 18, 42, 'Baris 2 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 19, 43, 'Baris 2 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 20, 44, 'Baris 2 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 21, 45, 'Baris 2 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 22, 46, 'Baris 2 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 23, 47, 'Baris 2 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 2, 24, 48, 'Baris 2 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 1, 49, 'Baris 3 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 2, 50, 'Baris 3 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 3, 51, 'Baris 3 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 4, 52, 'Baris 3 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 5, 53, 'Baris 3 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 6, 54, 'Baris 3 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 7, 55, 'Baris 3 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 8, 56, 'Baris 3 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 9, 57, 'Baris 3 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 10, 58, 'Baris 3 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 11, 59, 'Baris 3 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 12, 60, 'Baris 3 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 13, 61, 'Baris 3 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 14, 62, 'Baris 3 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 15, 63, 'Baris 3 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 16, 64, 'Baris 3 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 17, 65, 'Baris 3 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 18, 66, 'Baris 3 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 19, 67, 'Baris 3 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 20, 68, 'Baris 3 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 21, 69, 'Baris 3 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 22, 70, 'Baris 3 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 23, 71, 'Baris 3 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 3, 24, 72, 'Baris 3 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 1, 73, 'Baris 4 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 2, 74, 'Baris 4 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 3, 75, 'Baris 4 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 4, 76, 'Baris 4 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 5, 77, 'Baris 4 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 6, 78, 'Baris 4 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 7, 79, 'Baris 4 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 8, 80, 'Baris 4 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 9, 81, 'Baris 4 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 10, 82, 'Baris 4 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 11, 83, 'Baris 4 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 12, 84, 'Baris 4 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 13, 85, 'Baris 4 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 14, 86, 'Baris 4 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 15, 87, 'Baris 4 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 16, 88, 'Baris 4 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 17, 89, 'Baris 4 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 18, 90, 'Baris 4 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 19, 91, 'Baris 4 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 20, 92, 'Baris 4 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 21, 93, 'Baris 4 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 22, 94, 'Baris 4 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 23, 95, 'Baris 4 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000002', 4, 24, 96, 'Baris 4 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;

-- 3. Insert Ports for OTB 96 Core 2 (4 rows x 24 cols)
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 1, 1, 'Baris 1 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 2, 2, 'Baris 1 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 3, 3, 'Baris 1 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 4, 4, 'Baris 1 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 5, 5, 'Baris 1 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 6, 6, 'Baris 1 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 7, 7, 'Baris 1 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 8, 8, 'Baris 1 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 9, 9, 'Baris 1 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 10, 10, 'Baris 1 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 11, 11, 'Baris 1 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 12, 12, 'Baris 1 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 13, 13, 'Baris 1 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 14, 14, 'Baris 1 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 15, 15, 'Baris 1 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 16, 16, 'Baris 1 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 17, 17, 'Baris 1 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 18, 18, 'Baris 1 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 19, 19, 'Baris 1 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 20, 20, 'Baris 1 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 21, 21, 'Baris 1 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 22, 22, 'Baris 1 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 23, 23, 'Baris 1 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 1, 24, 24, 'Baris 1 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 1, 25, 'Baris 2 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 2, 26, 'Baris 2 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 3, 27, 'Baris 2 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 4, 28, 'Baris 2 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 5, 29, 'Baris 2 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 6, 30, 'Baris 2 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 7, 31, 'Baris 2 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 8, 32, 'Baris 2 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 9, 33, 'Baris 2 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 10, 34, 'Baris 2 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 11, 35, 'Baris 2 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 12, 36, 'Baris 2 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 13, 37, 'Baris 2 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 14, 38, 'Baris 2 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 15, 39, 'Baris 2 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 16, 40, 'Baris 2 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 17, 41, 'Baris 2 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 18, 42, 'Baris 2 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 19, 43, 'Baris 2 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 20, 44, 'Baris 2 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 21, 45, 'Baris 2 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 22, 46, 'Baris 2 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 23, 47, 'Baris 2 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 2, 24, 48, 'Baris 2 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 1, 49, 'Baris 3 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 2, 50, 'Baris 3 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 3, 51, 'Baris 3 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 4, 52, 'Baris 3 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 5, 53, 'Baris 3 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 6, 54, 'Baris 3 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 7, 55, 'Baris 3 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 8, 56, 'Baris 3 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 9, 57, 'Baris 3 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 10, 58, 'Baris 3 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 11, 59, 'Baris 3 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 12, 60, 'Baris 3 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 13, 61, 'Baris 3 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 14, 62, 'Baris 3 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 15, 63, 'Baris 3 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 16, 64, 'Baris 3 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 17, 65, 'Baris 3 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 18, 66, 'Baris 3 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 19, 67, 'Baris 3 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 20, 68, 'Baris 3 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 21, 69, 'Baris 3 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 22, 70, 'Baris 3 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 23, 71, 'Baris 3 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 3, 24, 72, 'Baris 3 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 1, 73, 'Baris 4 No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 2, 74, 'Baris 4 No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 3, 75, 'Baris 4 No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 4, 76, 'Baris 4 No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 5, 77, 'Baris 4 No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 6, 78, 'Baris 4 No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 7, 79, 'Baris 4 No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 8, 80, 'Baris 4 No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 9, 81, 'Baris 4 No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 10, 82, 'Baris 4 No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 11, 83, 'Baris 4 No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 12, 84, 'Baris 4 No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 13, 85, 'Baris 4 No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 14, 86, 'Baris 4 No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 15, 87, 'Baris 4 No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 16, 88, 'Baris 4 No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 17, 89, 'Baris 4 No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 18, 90, 'Baris 4 No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 19, 91, 'Baris 4 No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 20, 92, 'Baris 4 No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 21, 93, 'Baris 4 No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 22, 94, 'Baris 4 No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 23, 95, 'Baris 4 No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000003', 4, 24, 96, 'Baris 4 No 24') ON CONFLICT (device_id, port_label) DO NOTHING;

-- 4. Insert Ports for OTB 144 Core (12 rows x 12 cols, No 1-144)
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 1, 1, 'No 1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 2, 2, 'No 2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 3, 3, 'No 3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 4, 4, 'No 4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 5, 5, 'No 5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 6, 6, 'No 6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 7, 7, 'No 7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 8, 8, 'No 8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 9, 9, 'No 9') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 10, 10, 'No 10') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 11, 11, 'No 11') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 1, 12, 12, 'No 12') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 1, 13, 'No 13') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 2, 14, 'No 14') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 3, 15, 'No 15') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 4, 16, 'No 16') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 5, 17, 'No 17') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 6, 18, 'No 18') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 7, 19, 'No 19') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 8, 20, 'No 20') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 9, 21, 'No 21') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 10, 22, 'No 22') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 11, 23, 'No 23') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 2, 12, 24, 'No 24') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 1, 25, 'No 25') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 2, 26, 'No 26') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 3, 27, 'No 27') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 4, 28, 'No 28') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 5, 29, 'No 29') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 6, 30, 'No 30') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 7, 31, 'No 31') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 8, 32, 'No 32') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 9, 33, 'No 33') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 10, 34, 'No 34') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 11, 35, 'No 35') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 3, 12, 36, 'No 36') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 1, 37, 'No 37') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 2, 38, 'No 38') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 3, 39, 'No 39') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 4, 40, 'No 40') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 5, 41, 'No 41') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 6, 42, 'No 42') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 7, 43, 'No 43') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 8, 44, 'No 44') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 9, 45, 'No 45') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 10, 46, 'No 46') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 11, 47, 'No 47') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 4, 12, 48, 'No 48') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 1, 49, 'No 49') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 2, 50, 'No 50') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 3, 51, 'No 51') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 4, 52, 'No 52') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 5, 53, 'No 53') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 6, 54, 'No 54') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 7, 55, 'No 55') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 8, 56, 'No 56') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 9, 57, 'No 57') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 10, 58, 'No 58') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 11, 59, 'No 59') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 5, 12, 60, 'No 60') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 1, 61, 'No 61') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 2, 62, 'No 62') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 3, 63, 'No 63') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 4, 64, 'No 64') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 5, 65, 'No 65') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 6, 66, 'No 66') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 7, 67, 'No 67') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 8, 68, 'No 68') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 9, 69, 'No 69') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 10, 70, 'No 70') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 11, 71, 'No 71') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 6, 12, 72, 'No 72') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 1, 73, 'No 73') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 2, 74, 'No 74') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 3, 75, 'No 75') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 4, 76, 'No 76') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 5, 77, 'No 77') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 6, 78, 'No 78') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 7, 79, 'No 79') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 8, 80, 'No 80') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 9, 81, 'No 81') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 10, 82, 'No 82') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 11, 83, 'No 83') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 7, 12, 84, 'No 84') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 1, 85, 'No 85') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 2, 86, 'No 86') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 3, 87, 'No 87') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 4, 88, 'No 88') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 5, 89, 'No 89') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 6, 90, 'No 90') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 7, 91, 'No 91') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 8, 92, 'No 92') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 9, 93, 'No 93') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 10, 94, 'No 94') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 11, 95, 'No 95') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 8, 12, 96, 'No 96') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 1, 97, 'No 97') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 2, 98, 'No 98') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 3, 99, 'No 99') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 4, 100, 'No 100') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 5, 101, 'No 101') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 6, 102, 'No 102') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 7, 103, 'No 103') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 8, 104, 'No 104') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 9, 105, 'No 105') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 10, 106, 'No 106') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 11, 107, 'No 107') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 9, 12, 108, 'No 108') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 1, 109, 'No 109') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 2, 110, 'No 110') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 3, 111, 'No 111') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 4, 112, 'No 112') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 5, 113, 'No 113') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 6, 114, 'No 114') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 7, 115, 'No 115') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 8, 116, 'No 116') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 9, 117, 'No 117') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 10, 118, 'No 118') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 11, 119, 'No 119') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 10, 12, 120, 'No 120') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 1, 121, 'No 121') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 2, 122, 'No 122') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 3, 123, 'No 123') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 4, 124, 'No 124') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 5, 125, 'No 125') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 6, 126, 'No 126') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 7, 127, 'No 127') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 8, 128, 'No 128') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 9, 129, 'No 129') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 10, 130, 'No 130') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 11, 131, 'No 131') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 11, 12, 132, 'No 132') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 1, 133, 'No 133') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 2, 134, 'No 134') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 3, 135, 'No 135') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 4, 136, 'No 136') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 5, 137, 'No 137') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 6, 138, 'No 138') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 7, 139, 'No 139') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 8, 140, 'No 140') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 9, 141, 'No 141') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 10, 142, 'No 142') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 11, 143, 'No 143') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000004', 12, 12, 144, 'No 144') ON CONFLICT (device_id, port_label) DO NOTHING;

-- 5. Insert Ports for OLT ZTE C300 (Slots 3-16, PON 1-8 each)
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 1, 'PON 3/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 2, 'PON 3/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 3, 'PON 3/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 4, 'PON 3/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 5, 'PON 3/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 6, 'PON 3/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 7, 'PON 3/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 3, 8, 'PON 3/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 1, 'PON 4/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 2, 'PON 4/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 3, 'PON 4/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 4, 'PON 4/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 5, 'PON 4/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 6, 'PON 4/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 7, 'PON 4/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 4, 8, 'PON 4/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 1, 'PON 5/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 2, 'PON 5/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 3, 'PON 5/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 4, 'PON 5/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 5, 'PON 5/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 6, 'PON 5/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 7, 'PON 5/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 5, 8, 'PON 5/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 1, 'PON 6/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 2, 'PON 6/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 3, 'PON 6/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 4, 'PON 6/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 5, 'PON 6/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 6, 'PON 6/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 7, 'PON 6/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 6, 8, 'PON 6/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 1, 'PON 7/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 2, 'PON 7/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 3, 'PON 7/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 4, 'PON 7/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 5, 'PON 7/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 6, 'PON 7/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 7, 'PON 7/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 7, 8, 'PON 7/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 1, 'PON 8/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 2, 'PON 8/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 3, 'PON 8/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 4, 'PON 8/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 5, 'PON 8/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 6, 'PON 8/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 7, 'PON 8/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 8, 8, 'PON 8/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 1, 'PON 9/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 2, 'PON 9/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 3, 'PON 9/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 4, 'PON 9/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 5, 'PON 9/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 6, 'PON 9/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 7, 'PON 9/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 9, 8, 'PON 9/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 1, 'PON 10/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 2, 'PON 10/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 3, 'PON 10/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 4, 'PON 10/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 5, 'PON 10/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 6, 'PON 10/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 7, 'PON 10/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 10, 8, 'PON 10/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 1, 'PON 11/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 2, 'PON 11/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 3, 'PON 11/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 4, 'PON 11/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 5, 'PON 11/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 6, 'PON 11/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 7, 'PON 11/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 11, 8, 'PON 11/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 1, 'PON 12/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 2, 'PON 12/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 3, 'PON 12/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 4, 'PON 12/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 5, 'PON 12/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 6, 'PON 12/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 7, 'PON 12/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 12, 8, 'PON 12/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 1, 'PON 13/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 2, 'PON 13/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 3, 'PON 13/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 4, 'PON 13/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 5, 'PON 13/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 6, 'PON 13/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 7, 'PON 13/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 13, 8, 'PON 13/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 1, 'PON 14/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 2, 'PON 14/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 3, 'PON 14/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 4, 'PON 14/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 5, 'PON 14/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 6, 'PON 14/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 7, 'PON 14/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 14, 8, 'PON 14/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 1, 'PON 15/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 2, 'PON 15/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 3, 'PON 15/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 4, 'PON 15/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 5, 'PON 15/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 6, 'PON 15/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 7, 'PON 15/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 15, 8, 'PON 15/8') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 1, 'PON 16/1') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 2, 'PON 16/2') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 3, 'PON 16/3') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 4, 'PON 16/4') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 5, 'PON 16/5') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 6, 'PON 16/6') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 7, 'PON 16/7') ON CONFLICT (device_id, port_label) DO NOTHING;
INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('e0000000-0000-0000-0000-000000000001', 16, 8, 'PON 16/8') ON CONFLICT (device_id, port_label) DO NOTHING;

-- =====================================================
-- 6. CONNECT THE 91 INITIAL PORTS (FROM DATA SERVER.TXT)
-- =====================================================

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 15'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/1') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 15');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 16'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/2') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 16');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 109'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/3') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 109');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 78'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 78');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 15'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 15');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 46'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 46');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 45'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/7') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 45');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 3/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 110'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 3/8') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 110');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 85'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 85');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 8'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/2') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 8');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 14'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 14');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 1 No 9'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/4') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 1 No 9');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 1 No 10'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 1 No 10');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 13'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 13');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 4/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 1 No 11'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 4/8') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 1 No 11');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 92'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 92');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 84'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 84');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 11'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/3') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 11');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 82'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 82');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 1 No 8'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 1 No 8');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 38'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 38');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 18'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/7') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 18');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 5/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 3'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 5/8') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 3');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 17'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/1') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 17');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 13'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/2') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 13');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 1 No 12'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 1 No 12');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 91'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 91');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 21'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 21');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 37'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 37');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 22'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/7') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 22');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 6/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 15'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 6/8') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 15');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 14'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 14');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 44'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 44');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 1'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 1');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 41'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 41');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 16'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 16');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 19'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/6') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 19');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 73'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/7') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 73');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 7/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 83'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 7/8') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 83');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 1'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/1') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 1');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 75'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 75');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 1'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/3') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 1');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 4'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/4') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 4');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 3'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/5') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 3');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 4'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/6') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 4');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 2'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/7') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 2');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 8/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 87'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 8/8') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 87');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 115'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 115');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 116'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 116');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 6'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/3') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 6');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 79'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 79');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 1'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/5') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 1');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 10'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 10');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 80'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/7') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 80');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 9/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 118'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 9/8') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 118');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 117'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 117');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 119'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 119');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 120'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/3') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 120');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 39'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 39');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 104'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/5') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 104');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 105'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/6') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 105');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 111'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/7') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 111');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 12/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 20'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 12/8') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 20');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 90'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/1') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 90');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 81'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 81');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 4'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 4');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 5'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/4') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 5');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 24'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 24');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 2 No 23'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/6') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 2 No 23');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 3 No 14'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/7') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 3 No 14');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 13/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 3 No 13'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 13/8') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 3 No 13');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 2'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/1') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 2');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 3'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/2') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 3');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 4'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 4');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 77'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/4') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 77');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 23'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/5') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 23');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 19'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/6') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 19');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 20'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/7') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 20');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 14/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 1'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 14/8') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 1');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 24'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/1') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 24');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 6'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/2') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 6');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 3 No 12'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/3') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 3 No 12');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 17'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/4') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 17');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/5'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 6'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/5') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 6');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/6'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 5'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/6') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 5');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/7'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 2 No 12'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/7') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 2 No 12');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 15/8'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 3 No 8'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 15/8') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 3 No 8');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 16/1'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000003' AND pb.port_label = 'Baris 1 No 5'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 16/1') OR (device_id = 'e0000000-0000-0000-0000-000000000003' AND port_label = 'Baris 1 No 5');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 16/2'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000004' AND pb.port_label = 'No 112'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 16/2') OR (device_id = 'e0000000-0000-0000-0000-000000000004' AND port_label = 'No 112');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 16/3'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 10'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 16/3') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 10');

INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = 'e0000000-0000-0000-0000-000000000001' AND pa.port_label = 'PON 16/4'
  AND pb.device_id = 'e0000000-0000-0000-0000-000000000002' AND pb.port_label = 'Baris 4 No 19'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = 'e0000000-0000-0000-0000-000000000001' AND port_label = 'PON 16/4') OR (device_id = 'e0000000-0000-0000-0000-000000000002' AND port_label = 'Baris 4 No 19');

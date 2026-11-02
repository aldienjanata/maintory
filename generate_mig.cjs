const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('C:/Users/acer/Downloads/DATA SERVER.txt', 'utf8');
const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

// IDs for fixed devices
const ID_OLT = 'e0000000-0000-0000-0000-000000000001';
const ID_OTB_96_1 = 'e0000000-0000-0000-0000-000000000002';
const ID_OTB_96_2 = 'e0000000-0000-0000-0000-000000000003';
const ID_OTB_144 = 'e0000000-0000-0000-0000-000000000004';

let sql = `-- =====================================================
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
  ('${ID_OLT}', 'banyumas', 'OLT ZTE C300', 'olt', 'ZTE C300', 112, 14, 8, 'OLT Utama Ruang Server (Slot 3-16, PON Ports)'),
  ('${ID_OTB_96_1}', 'banyumas', 'OTB 96 Core 1', 'otb', 'OTB 96 Core Rackmount', 96, 4, 24, 'OTB 96 Core #1 (4 Baris x 24 Port)'),
  ('${ID_OTB_96_2}', 'banyumas', 'OTB 96 Core 2', 'otb', 'OTB 96 Core Rackmount', 96, 4, 24, 'OTB 96 Core #2 (4 Baris x 24 Port)'),
  ('${ID_OTB_144}', 'banyumas', 'OTB 144 Core', 'otb', 'OTB 144 Core Rackmount', 144, 12, 12, 'OTB 144 Core (12 Baris x 12 Port / No 1-144)')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  brand_model = EXCLUDED.brand_model,
  total_ports = EXCLUDED.total_ports,
  rows_count = EXCLUDED.rows_count,
  cols_count = EXCLUDED.cols_count;

-- 2. Insert Ports for OTB 96 Core 1 (4 rows x 24 cols)
`;

for (let r = 1; r <= 4; r++) {
  for (let c = 1; c <= 24; c++) {
    const portNo = (r - 1) * 24 + c;
    const label = `Baris ${r} No ${c}`;
    sql += `INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('${ID_OTB_96_1}', ${r}, ${c}, ${portNo}, '${label}') ON CONFLICT (device_id, port_label) DO NOTHING;\n`;
  }
}

sql += `\n-- 3. Insert Ports for OTB 96 Core 2 (4 rows x 24 cols)\n`;
for (let r = 1; r <= 4; r++) {
  for (let c = 1; c <= 24; c++) {
    const portNo = (r - 1) * 24 + c;
    const label = `Baris ${r} No ${c}`;
    sql += `INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('${ID_OTB_96_2}', ${r}, ${c}, ${portNo}, '${label}') ON CONFLICT (device_id, port_label) DO NOTHING;\n`;
  }
}

sql += `\n-- 4. Insert Ports for OTB 144 Core (12 rows x 12 cols, No 1-144)\n`;
for (let p = 1; p <= 144; p++) {
  const r = Math.ceil(p / 12);
  const c = ((p - 1) % 12) + 1;
  const label = `No ${p}`;
  sql += `INSERT INTO public.server_ports (device_id, row_number, col_number, port_number, port_label) VALUES ('${ID_OTB_144}', ${r}, ${c}, ${p}, '${label}') ON CONFLICT (device_id, port_label) DO NOTHING;\n`;
}

sql += `\n-- 5. Insert Ports for OLT ZTE C300 (Slots 3-16, PON 1-8 each)\n`;
// Slots 3 to 16, ports 1 to 8
for (let s = 3; s <= 16; s++) {
  for (let p = 1; p <= 8; p++) {
    const label = `PON ${s}/${p}`;
    sql += `INSERT INTO public.server_ports (device_id, slot_number, port_number, port_label) VALUES ('${ID_OLT}', ${s}, ${p}, '${label}') ON CONFLICT (device_id, port_label) DO NOTHING;\n`;
  }
}

sql += `\n-- =====================================================\n-- 6. CONNECT THE 91 INITIAL PORTS (FROM DATA SERVER.TXT)\n-- =====================================================\n`;

lines.forEach((line) => {
  const parts = line.split(/\s*-\s*/);
  if (parts.length < 2) return;
  const oltMatch = parts[0].trim().match(/OLT\s+PON\s+(\d+)\/(\d+)/i);
  if (!oltMatch) return;
  const slot = parseInt(oltMatch[1], 10);
  const pon = parseInt(oltMatch[2], 10);
  const oltLabel = `PON ${slot}/${pon}`;

  const otbPart = parts[1].trim();
  let otbDevId = '';
  let otbLabel = '';

  if (otbPart.match(/OTB\s+144\s+no\s+(\d+)/i)) {
    const m = otbPart.match(/OTB\s+144\s+no\s+(\d+)/i);
    otbDevId = ID_OTB_144;
    otbLabel = `No ${parseInt(m[1], 10)}`;
  } else if (otbPart.match(/OTB\s*(?:96|92)\s*1\s*baris\s*(\d+)\s*no\s*(\d+)/i)) {
    const m = otbPart.match(/OTB\s*(?:96|92)\s*1\s*baris\s*(\d+)\s*no\s*(\d+)/i);
    otbDevId = ID_OTB_96_1;
    otbLabel = `Baris ${parseInt(m[1], 10)} No ${parseInt(m[2], 10)}`;
  } else if (otbPart.match(/OTB\s*(?:96|92)\s*2\s*baris\s*(\d+)\s*no\s*(\d+)/i)) {
    const m = otbPart.match(/OTB\s*(?:96|92)\s*2\s*baris\s*(\d+)\s*no\s*(\d+)/i);
    otbDevId = ID_OTB_96_2;
    otbLabel = `Baris ${parseInt(m[1], 10)} No ${parseInt(m[2], 10)}`;
  }

  if (otbDevId && otbLabel) {
    sql += `
INSERT INTO public.server_connections (port_a_id, port_b_id, cable_type, note)
SELECT 
  pa.id, pb.id, 'Patchcord SC-SC', 'Koneksi Server Awal'
FROM public.server_ports pa, public.server_ports pb
WHERE pa.device_id = '${ID_OLT}' AND pa.port_label = '${oltLabel}'
  AND pb.device_id = '${otbDevId}' AND pb.port_label = '${otbLabel}'
ON CONFLICT (port_a_id) DO NOTHING;

UPDATE public.server_ports SET status = 'connected' WHERE (device_id = '${ID_OLT}' AND port_label = '${oltLabel}') OR (device_id = '${otbDevId}' AND port_label = '${otbLabel}');
`;
  }
});

fs.writeFileSync('server_patching_migration.sql', sql);
console.log('Migration generated successfully! File size: ' + sql.length + ' bytes');

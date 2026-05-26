-- MAINTORY SUPABASE SCHEMA

-- 1. Tabel users
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'teknisi')),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read users" 
ON public.users FOR SELECT TO authenticated USING (true);

-- Only superadmin can manage users
CREATE POLICY "Superadmin can manage users" 
ON public.users FOR ALL TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
);


-- 2. Tabel app_settings
CREATE TABLE public.app_settings (
    id SERIAL PRIMARY KEY,
    branch_name TEXT DEFAULT 'Cabang Banyumas',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmin can update settings" ON public.app_settings FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
);


-- 3. Tabel maintenance_tickets
CREATE TABLE public.maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL,
    date_input DATE NOT NULL DEFAULT CURRENT_DATE,
    village TEXT,
    customer_name TEXT NOT NULL,
    address TEXT,
    customer_id TEXT NOT NULL,
    phone_number TEXT,
    complaint TEXT,
    sharelok TEXT,
    note TEXT,
    action_note TEXT,
    status TEXT DEFAULT 'aktif' CHECK (status IN ('aktif', 'pending', 'close')),
    technicians UUID[] DEFAULT '{}',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read maintenance" ON public.maintenance_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert maintenance" ON public.maintenance_tickets FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);
CREATE POLICY "Admin can update maintenance" ON public.maintenance_tickets FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin', 'teknisi')
);
CREATE POLICY "Admin can delete maintenance" ON public.maintenance_tickets FOR DELETE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);


-- 4. Tabel warehouses (Stok Gudang)
CREATE TABLE public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,
    initial_stock NUMERIC DEFAULT 0,
    unit TEXT,
    item_type TEXT CHECK (item_type IN ('ont', 'dropcore_1c', 'dropcore_4c', 'other')),
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmin can manage warehouses" ON public.warehouses FOR ALL TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
);


-- 5. Tabel ont_brands & ont_types
CREATE TABLE public.ont_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.ont_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES public.ont_brands(id) ON DELETE CASCADE,
    type_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 6. Tabel serial_numbers
CREATE TABLE public.serial_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES public.ont_brands(id),
    type_id UUID REFERENCES public.ont_types(id),
    serial_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'tersedia' CHECK (status IN ('tersedia', 'terpakai')),
    date_in DATE DEFAULT CURRENT_DATE,
    note TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read sn" ON public.serial_numbers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage sn" ON public.serial_numbers FOR ALL TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);


-- 7. Tabel dropcore_haspels
CREATE TABLE public.dropcore_haspels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    haspel_code TEXT UNIQUE NOT NULL,
    type TEXT CHECK (type IN ('1c', '4c')),
    initial_meters NUMERIC DEFAULT 1000,
    used_meters NUMERIC DEFAULT 0,
    remaining_meters NUMERIC GENERATED ALWAYS AS (initial_meters - used_meters) STORED,
    status TEXT DEFAULT 'tersedia' CHECK (status IN ('tersedia', 'habis')),
    date_in DATE DEFAULT CURRENT_DATE,
    note TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.dropcore_haspels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read haspels" ON public.dropcore_haspels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert haspels" ON public.dropcore_haspels FOR INSERT TO authenticated WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin', 'teknisi')
);
CREATE POLICY "Admin can update haspels" ON public.dropcore_haspels FOR UPDATE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);
CREATE POLICY "Admin can delete haspels" ON public.dropcore_haspels FOR DELETE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);


-- 8. Tabel daily_schedules
CREATE TABLE public.daily_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_date DATE NOT NULL,
    technicians UUID[] DEFAULT '{}',
    work_type TEXT CHECK (work_type IN ('ikr_psb', 'maintenance')),
    site TEXT CHECK (site IN ('banyumas', 'cilacap', 'cilacap_herman')),
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 9. Tabel daily_expenses
CREATE TABLE public.daily_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date DATE NOT NULL,
    technicians UUID[] DEFAULT '{}',
    site TEXT CHECK (site IN ('banyumas', 'cilacap', 'cilacap_herman')),
    work_type TEXT CHECK (work_type IN ('ikr_psb', 'maintenance')),
    note TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 10. Tabel expense_items
CREATE TABLE public.expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID REFERENCES public.daily_expenses(id) ON DELETE CASCADE,
    item_type TEXT CHECK (item_type IN ('ont', 'dropcore', 'other')),
    serial_number_id UUID REFERENCES public.serial_numbers(id),
    haspel_id UUID REFERENCES public.dropcore_haspels(id),
    meters_used NUMERIC,
    warehouse_item_id UUID REFERENCES public.warehouses(id),
    quantity NUMERIC DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 11. Tabel dismantles
CREATE TABLE public.dismantles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_input DATE DEFAULT CURRENT_DATE,
    customer_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    address TEXT,
    sharelok TEXT,
    phone_number TEXT,
    last_payment TEXT,
    serial_number TEXT,
    technicians UUID[] DEFAULT '{}',
    aksi TEXT DEFAULT 'aktif' CHECK (aksi IN ('aktif', 'close')),
    pickup_date DATE,
    note TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 12. Tabel ont_replacements
CREATE TABLE public.ont_replacements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    replacement_date DATE DEFAULT CURRENT_DATE,
    customer_name TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    old_serial_number TEXT NOT NULL,
    new_serial_number_id UUID REFERENCES public.serial_numbers(id),
    reason TEXT,
    technicians UUID[] DEFAULT '{}',
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);


-- 13. Tabel activity_logs
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    username TEXT,
    role TEXT,
    module TEXT,
    action TEXT,
    detail TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read their own logs" ON public.activity_logs FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);
CREATE POLICY "Superadmin can delete logs" ON public.activity_logs FOR DELETE TO authenticated USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
);

-- ============================================
-- FIX: Infinite Recursion RLS + Rebuild Policies
-- Jalankan ini di Supabase SQL Editor
-- ============================================

-- 1. Buat fungsi helper SECURITY DEFINER agar bisa baca role tanpa trigger RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 2. Perbaiki RLS tabel users (penyebab utama infinite recursion)
-- ============================================
DROP POLICY IF EXISTS "Everyone can read users" ON public.users;
DROP POLICY IF EXISTS "Superadmin can manage users" ON public.users;

-- Semua user yang sudah login bisa baca semua profil
CREATE POLICY "Users: read all authenticated"
ON public.users FOR SELECT
TO authenticated
USING (true);

-- Hanya superadmin yang bisa insert/update/delete (pakai helper function, bukan subquery)
CREATE POLICY "Users: superadmin insert"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'superadmin');

CREATE POLICY "Users: superadmin update"
ON public.users FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'superadmin');

CREATE POLICY "Users: superadmin delete"
ON public.users FOR DELETE
TO authenticated
USING (public.get_my_role() = 'superadmin');

-- ============================================
-- 3. Perbaiki RLS tabel lainnya (ganti subquery dengan fungsi helper)
-- ============================================

-- maintenance_tickets
DROP POLICY IF EXISTS "Admin can insert maintenance" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Admin can update maintenance" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Admin can delete maintenance" ON public.maintenance_tickets;

CREATE POLICY "Maintenance: admin insert"
ON public.maintenance_tickets FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Maintenance: all can update"
ON public.maintenance_tickets FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'teknisi'));

CREATE POLICY "Maintenance: admin delete"
ON public.maintenance_tickets FOR DELETE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

-- serial_numbers
DROP POLICY IF EXISTS "Admin can manage sn" ON public.serial_numbers;

CREATE POLICY "SN: admin manage"
ON public.serial_numbers FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

-- warehouses
DROP POLICY IF EXISTS "Superadmin can manage warehouses" ON public.warehouses;

CREATE POLICY "Warehouse: superadmin manage"
ON public.warehouses FOR ALL
TO authenticated
USING (public.get_my_role() = 'superadmin');

-- dropcore_haspels
DROP POLICY IF EXISTS "Admin can insert haspels" ON public.dropcore_haspels;
DROP POLICY IF EXISTS "Admin can update haspels" ON public.dropcore_haspels;
DROP POLICY IF EXISTS "Admin can delete haspels" ON public.dropcore_haspels;

CREATE POLICY "Haspel: all can insert"
ON public.dropcore_haspels FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'teknisi'));

CREATE POLICY "Haspel: admin update"
ON public.dropcore_haspels FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Haspel: admin delete"
ON public.dropcore_haspels FOR DELETE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

-- activity_logs
DROP POLICY IF EXISTS "Everyone can read their own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Superadmin can delete logs" ON public.activity_logs;

CREATE POLICY "Logs: read own or admin"
ON public.activity_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Logs: all can insert"
ON public.activity_logs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Logs: superadmin delete"
ON public.activity_logs FOR DELETE
TO authenticated
USING (public.get_my_role() = 'superadmin');

-- app_settings
DROP POLICY IF EXISTS "Superadmin can update settings" ON public.app_settings;

CREATE POLICY "Settings: superadmin update"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'superadmin');

-- Perbaiki RLS untuk network_poles agar superadmin bisa menghapus SEMUA data
DROP POLICY IF EXISTS "Poles: all can read" ON public.network_poles;
DROP POLICY IF EXISTS "Poles: superadmin/admin manage" ON public.network_poles;
DROP POLICY IF EXISTS "Poles: teknisi manage own" ON public.network_poles;

-- 1. Semua yang login bisa baca
CREATE POLICY "Poles: all can read"
ON public.network_poles FOR SELECT
TO authenticated
USING (true);

-- 2. Superadmin dan admin bisa tambah
CREATE POLICY "Poles: admin insert"
ON public.network_poles FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'teknisi'));

-- 3. Superadmin dan admin bisa edit/hapus apa saja
CREATE POLICY "Poles: admin update"
ON public.network_poles FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Poles: admin delete"
ON public.network_poles FOR DELETE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

-- 4. Teknisi hanya bisa edit/hapus milik sendiri
CREATE POLICY "Poles: teknisi update own"
ON public.network_poles FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'teknisi' AND created_by = auth.uid());

CREATE POLICY "Poles: teknisi delete own"
ON public.network_poles FOR DELETE
TO authenticated
USING (public.get_my_role() = 'teknisi' AND created_by = auth.uid());

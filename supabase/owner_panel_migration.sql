-- Tambah kolom ke app_settings untuk theme management
ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS design_model TEXT DEFAULT 'dark_pro',
  ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#00a3ff',
  ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter';

-- Buat tabel security logs untuk owner monitoring
CREATE TABLE IF NOT EXISTS public.owner_security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT,
  status TEXT CHECK (status IN ('success', 'failed')),
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Nonaktifkan RLS untuk security logs (hanya diakses owner)
ALTER TABLE public.owner_security_logs ENABLE ROW LEVEL SECURITY;

-- Semua authenticated user bisa insert log (untuk mencatat login)
CREATE POLICY "Anyone can insert security logs"
ON public.owner_security_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Tidak ada yang bisa baca dari frontend biasa (hanya via service_role di edge function)
CREATE POLICY "No direct select on security logs"
ON public.owner_security_logs FOR SELECT
TO authenticated
USING (false);

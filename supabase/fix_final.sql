-- 1. Hapus data lama yang tersangkut (jika ada)
DELETE FROM auth.users WHERE email = 'superadmin@maintory.local';
DELETE FROM public.users WHERE username = 'superadmin';

-- 2. Hapus trigger yang sebelumnya kita buat agar tidak terjadi duplikat
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Insert akun Superadmin ke tabel autentikasi Supabase
INSERT INTO auth.users (
  id, 
  instance_id, 
  email, 
  encrypted_password, 
  email_confirmed_at, 
  raw_app_meta_data, 
  raw_user_meta_data, 
  created_at, 
  updated_at, 
  role, 
  aud, 
  confirmation_token, 
  email_change, 
  email_change_token_new, 
  recovery_token
)
VALUES (
  'd508e92c-5b58-45e3-979f-09e8b7d60565', 
  '00000000-0000-0000-0000-000000000000', 
  'superadmin@maintory.local', 
  crypt('super1234', gen_salt('bf')), 
  now(), 
  '{"provider":"email","providers":["email"]}', 
  '{"full_name":"Superadmin","username":"superadmin","role":"superadmin"}', 
  now(), 
  now(), 
  'authenticated', 
  'authenticated', -- Ini yang kurang di script awal sehingga Supabase menolaknya
  '', '', '', ''
);

-- 4. Insert profil Superadmin ke tabel public
INSERT INTO public.users (id, username, full_name, role) VALUES 
('d508e92c-5b58-45e3-979f-09e8b7d60565', 'superadmin', 'Super Administrator', 'superadmin');

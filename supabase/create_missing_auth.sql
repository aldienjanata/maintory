-- Script untuk membuat akun otentikasi (auth.users) bagi teknisi yang sudah ada di public.users
-- namun belum memiliki akses login.

DO $$ 
DECLARE
  tech RECORD;
BEGIN
  -- 1. Hapus trigger sementara agar tidak terjadi duplikasi ke public.users
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

  -- 2. Looping semua user di public.users yang tidak ada di auth.users
  FOR tech IN 
    SELECT * FROM public.users 
    WHERE id NOT IN (SELECT id FROM auth.users) 
  LOOP
    -- 3. Masukkan ke auth.users dengan password default 'WS1234'
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
      confirmation_token, 
      email_change, 
      email_change_token_new, 
      recovery_token
    )
    VALUES (
      tech.id, 
      '00000000-0000-0000-0000-000000000000', 
      tech.username || '@maintory.local', 
      crypt('WS1234', gen_salt('bf')), 
      now(), 
      '{"provider":"email","providers":["email"]}', 
      json_build_object('full_name', tech.full_name, 'username', tech.username, 'role', tech.role)::jsonb, 
      now(), 
      now(), 
      'authenticated', 
      '', '', '', ''
    );
  END LOOP;

  -- 4. Pasang kembali trigger untuk sinkronisasi otomatis ke depannya
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

END $$;

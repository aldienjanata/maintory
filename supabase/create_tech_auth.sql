-- Skrip Pasti Berhasil untuk Sinkronisasi Auth Users
-- Pastikan Anda menjalankan ini di SQL Editor Supabase

DO $$ 
DECLARE
  tech RECORD;
  inserted_count INTEGER := 0;
BEGIN
  -- 1. Matikan trigger sementara
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

  -- 2. Looping setiap teknisi di public.users
  FOR tech IN 
    SELECT * FROM public.users WHERE role = 'teknisi'
  LOOP
    -- 3. Cek apakah ID sudah ada di auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = tech.id) THEN
      
      -- Hapus email yang sama jika ada (untuk mencegah duplikat)
      DELETE FROM auth.users WHERE email = (tech.username || '@maintory.local');

      -- Insert ke auth.users
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        role, confirmation_token, email_change, email_change_token_new, recovery_token
      )
      VALUES (
        tech.id, '00000000-0000-0000-0000-000000000000', 
        tech.username || '@maintory.local', 
        crypt('WS1234', gen_salt('bf')), 
        now(), '{"provider":"email","providers":["email"]}', 
        json_build_object('full_name', tech.full_name, 'username', tech.username, 'role', tech.role)::jsonb, 
        now(), now(), 'authenticated', '', '', '', ''
      );
      
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  -- 4. Aktifkan trigger kembali
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

  RAISE NOTICE 'Berhasil menambahkan % akun teknisi ke sistem Login!', inserted_count;
END $$;

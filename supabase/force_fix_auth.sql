-- SCRIPT SINKRONISASI TOTAL & FORCE UPDATE PASSWORD
-- Jalankan ini di SQL Editor Supabase

DO $$ 
DECLARE
  tech RECORD;
BEGIN
  -- 1. Matikan trigger sementara
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

  -- 2. Looping semua teknisi dan admin
  FOR tech IN 
    SELECT * FROM public.users WHERE role IN ('teknisi', 'admin')
  LOOP
    -- 3. Jika sudah ada di auth.users, paksa update password & aud
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = tech.id) THEN
      UPDATE auth.users 
      SET 
        encrypted_password = crypt('WS1234', gen_salt('bf')),
        aud = 'authenticated',
        role = 'authenticated',
        email_confirmed_at = COALESCE(email_confirmed_at, now())
      WHERE id = tech.id;
      
    ELSE
      -- 4. Jika belum ada, hapus email yg bentrok lalu Insert baru
      DELETE FROM auth.users WHERE email = (tech.username || '@maintory.local');

      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        confirmation_token, email_change, email_change_token_new, recovery_token
      )
      VALUES (
        tech.id, '00000000-0000-0000-0000-0000-000000000000', 
        'authenticated', 'authenticated', 
        tech.username || '@maintory.local', 
        crypt('WS1234', gen_salt('bf')), 
        now(), '{"provider":"email","providers":["email"]}', 
        json_build_object('full_name', tech.full_name, 'username', tech.username, 'role', tech.role)::jsonb, 
        now(), now(), '', '', '', ''
      );
    END IF;
  END LOOP;

  -- 5. Aktifkan trigger kembali
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

END $$;

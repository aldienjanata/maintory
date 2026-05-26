DO $$ 
DECLARE
    user_record record;
    new_user_id uuid;
BEGIN
    -- Aktifkan ekstensi enkripsi
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Daftar semua user yang akan di-generate (termasuk superadmin, admin, dan teknisi)
    FOR user_record IN 
        SELECT * FROM (
            VALUES 
            ('superadmin', 'Super Administrator', 'superadmin', 'super1234'),
            ('hendri', 'Hendri', 'admin', 'ws1234'),
            ('lihun', 'Lihun', 'admin', 'ws1234'),
            ('aji', 'Aji', 'teknisi', 'WS1234'),
            ('aldo', 'Aldo', 'teknisi', 'WS1234'),
            ('anjar', 'Anjar', 'teknisi', 'WS1234'),
            ('arif', 'Arif', 'teknisi', 'WS1234'),
            ('dika', 'Dika', 'teknisi', 'WS1234'),
            ('hanif', 'Hanif', 'teknisi', 'WS1234'),
            ('ikin', 'Ikin', 'teknisi', 'WS1234'),
            ('novan', 'Novan', 'teknisi', 'WS1234'),
            ('sigit', 'Sigit', 'teknisi', 'WS1234'),
            ('wisnu', 'Wisnu', 'teknisi', 'WS1234'),
            ('pandu', 'Pandu', 'teknisi', 'WS1234')
        ) AS t(username, full_name, role, password)
    LOOP
        user_email := user_record.username || '@maintory.local';

        -- 1. Cari ID profil sebagai sumber kebenaran (menghindari relasi tiket/gudang terputus)
        SELECT id INTO new_user_id FROM public.users WHERE username = user_record.username;
        
        -- 2. Buat profil jika belum ada
        IF new_user_id IS NULL THEN
            new_user_id := gen_random_uuid();
            INSERT INTO public.users (id, username, full_name, role, is_active) 
            VALUES (new_user_id, user_record.username, user_record.full_name, user_record.role, true);
        ELSE
            -- Update profil jika ada perubahan nama/role
            UPDATE public.users 
            SET full_name = user_record.full_name, role = user_record.role, is_active = true
            WHERE id = new_user_id;
        END IF;

        -- 3. FIX DESYNC: Hapus akses login lama JIKA emailnya sama tapi ID-nya nyasar/berbeda
        DELETE FROM auth.users WHERE email = user_email AND id != new_user_id;

        -- 4. Buat atau perbaiki akses loginnya menggunakan ID yang benar
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = new_user_id) THEN
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at, 
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
                role, confirmation_token, email_change, email_change_token_new, recovery_token
            ) VALUES (
                new_user_id, '00000000-0000-0000-0000-000000000000', user_email, 
                crypt(user_record.password, gen_salt('bf')), now(), 
                '{"provider":"email","providers":["email"]}', 
                jsonb_build_object('full_name', user_record.full_name, 'username', user_record.username, 'role', user_record.role), 
                now(), now(), 'authenticated', '', '', '', ''
            );
            
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), new_user_id, format('{"sub":"%s","email":"%s"}', new_user_id::text, user_email)::jsonb, 
                'email', user_email, null, now(), now()
            );
        ELSE
            -- Jika sudah cocok, pastikan passwordnya benar-benar di-reset ke default
            UPDATE auth.users 
            SET encrypted_password = crypt(user_record.password, gen_salt('bf')),
                raw_user_meta_data = jsonb_build_object('full_name', user_record.full_name, 'username', user_record.username, 'role', user_record.role)
            WHERE id = new_user_id;
        END IF;

    END LOOP;

    -- Insert App Settings default (Jika belum ada)
    INSERT INTO public.app_settings (branch_name) VALUES ('Cabang Banyumas') ON CONFLICT DO NOTHING;
END $$;

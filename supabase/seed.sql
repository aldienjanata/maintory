-- Insert Superadmin
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES 
('d508e92c-5b58-45e3-979f-09e8b7d60565', '00000000-0000-0000-0000-000000000000', 'superadmin@maintory.local', crypt('super1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Superadmin","username":"superadmin","role":"superadmin"}', now(), now(), 'authenticated', '', '', '', '');

INSERT INTO public.users (id, username, full_name, role) VALUES 
('d508e92c-5b58-45e3-979f-09e8b7d60565', 'superadmin', 'Super Administrator', 'superadmin');

-- Insert Admins
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES 
('f5b5f8c6-c98f-4959-99fc-77b3127814b7', '00000000-0000-0000-0000-000000000000', 'hendri@maintory.local', crypt('ws1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hendri","username":"hendri","role":"admin"}', now(), now(), 'authenticated', '', '', '', ''),
('16d01306-6a56-4c4d-b92e-0678fa5ce856', '00000000-0000-0000-0000-000000000000', 'lihun@maintory.local', crypt('ws1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lihun","username":"lihun","role":"admin"}', now(), now(), 'authenticated', '', '', '', '');

INSERT INTO public.users (id, username, full_name, role) VALUES 
('f5b5f8c6-c98f-4959-99fc-77b3127814b7', 'hendri', 'Hendri', 'admin'),
('16d01306-6a56-4c4d-b92e-0678fa5ce856', 'lihun', 'Lihun', 'admin');

-- Insert Teknisi (Using generic UUIDs for demo, in reality they would be generated)
INSERT INTO public.users (username, full_name, role) VALUES 
('aji', 'Aji', 'teknisi'),
('aldo', 'Aldo', 'teknisi'),
('anjar', 'Anjar', 'teknisi'),
('arif', 'Arif', 'teknisi'),
('dika', 'Dika', 'teknisi'),
('hanif', 'Hanif', 'teknisi'),
('ikin', 'Ikin', 'teknisi'),
('novan', 'Novan', 'teknisi'),
('sigit', 'Sigit', 'teknisi'),
('wisnu', 'Wisnu', 'teknisi');

-- You would need to create corresponding auth.users for each teknisi with password 'WS1234'
-- In Supabase dashboard it's easier to create them via the UI or a script.

-- Insert App Settings
INSERT INTO public.app_settings (branch_name) VALUES ('Cabang Banyumas');

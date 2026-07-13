CREATE TABLE public.dispatches (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    dispatch_date DATE NOT NULL,
    technician_id UUID REFERENCES public.users(id) NOT NULL,
    site TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sedang_dibawa', -- 'sedang_dibawa', 'selesai', 'dibatalkan'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

CREATE TABLE public.dispatch_items (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- 'ont', 'dropcore', 'other'
    serial_number_id UUID REFERENCES public.serial_numbers(id),
    haspel_id UUID REFERENCES public.dropcore_haspels(id),
    warehouse_item_id UUID REFERENCES public.warehouses(id),
    quantity_dispatched NUMERIC DEFAULT 0,
    quantity_used NUMERIC DEFAULT 0,
    quantity_returned NUMERIC DEFAULT 0,
    meters_used NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS stock_on_hold NUMERIC DEFAULT 0;

-- Optional policies if using RLS
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.dispatches FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.dispatches FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON public.dispatches FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON public.dispatches FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON public.dispatch_items FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.dispatch_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON public.dispatch_items FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON public.dispatch_items FOR DELETE USING (auth.role() = 'authenticated');

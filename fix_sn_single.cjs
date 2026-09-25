const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

const oldSingle = `      if (editItem) {
        const { error } = await supabase.from('serial_numbers').update({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: form.status,
          updated_at: new Date().toISOString()
        }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Edit SN', detail: \`SN: \${form.serial_number}\` })
        toast.success('Serial Number berhasil diperbarui')
      } else {
        const { data: newSn, error } = await supabase.from('serial_numbers').insert({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: 'tersedia',
          created_by: profile.id
        }).select().single()
        if (error) throw error
        await supabase.from('inventory_log').insert({ log_date: form.date_in, item_type: 'sn', item_id: newSn.id, action: 'masuk', quantity: 1, note: form.note || null, created_by: profile.id })
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Tambah SN', detail: \`SN: \${form.serial_number}\` })
        toast.success('Serial Number berhasil ditambahkan')
      }`;

const newSingle = `      if (editItem) {
        const { error } = await supabase.from('serial_numbers').update({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: form.status,
          updated_at: new Date().toISOString()
        }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Edit SN', detail: \`SN: \${form.serial_number}\` })
        toast.success('Serial Number berhasil diperbarui')
      } else {
        const existingItem = items.find(i => i.serial_number.toLowerCase() === form.serial_number.toLowerCase())
        if (existingItem) {
          if (existingItem.status === 'tersedia') {
            toast.error('Serial Number sudah ada dan tersedia di gudang!')
            setSaving(false)
            return
          } else {
            const { error: recErr } = await supabase.from('serial_numbers').update({
              brand_id: brandId || existingItem.brand_id,
              type_id: typeId || existingItem.type_id,
              date_in: form.date_in,
              note: form.note || existingItem.note,
              status: 'tersedia',
              updated_at: new Date().toISOString()
            }).eq('id', existingItem.id)
            if (recErr) throw recErr
            await supabase.from('inventory_log').insert({ log_date: form.date_in, item_type: 'sn', item_id: existingItem.id, action: 'masuk', quantity: 1, note: form.note || 'Dismantle/Kembali ke gudang', created_by: profile.id })
            await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Recycle SN', detail: \`SN: \${form.serial_number} dikembalikan ke gudang\` })
            toast.success('Serial Number berhasil dikembalikan ke gudang (Recycle)')
          }
        } else {
          const { data: newSn, error } = await supabase.from('serial_numbers').insert({
            brand_id: brandId,
            type_id: typeId,
            serial_number: form.serial_number,
            date_in: form.date_in,
            note: form.note,
            status: 'tersedia',
            created_by: profile.id
          }).select().single()
          if (error) throw error
          await supabase.from('inventory_log').insert({ log_date: form.date_in, item_type: 'sn', item_id: newSn.id, action: 'masuk', quantity: 1, note: form.note || null, created_by: profile.id })
          await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Tambah SN', detail: \`SN: \${form.serial_number}\` })
          toast.success('Serial Number berhasil ditambahkan')
        }
      }`;

if (content.includes(oldSingle)) {
  content = content.replace(oldSingle, newSingle);
  console.log("Replaced single exact");
} else {
  content = content.replace(oldSingle.replace(/\r\n/g, '\n'), newSingle.replace(/\r\n/g, '\n'));
  console.log("Replaced single LF");
}

fs.writeFileSync('src/pages/inventory/SerialNumber.jsx', content);

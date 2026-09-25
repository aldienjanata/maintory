const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

const oldBulk = `      const existing = items.filter(i => lines.includes(i.serial_number)).map(i => i.serial_number)
      const toInsert = lines.filter(sn => !existing.includes(sn)).map(sn => ({ brand_id: brandId, type_id: typeId, serial_number: sn, date_in: form.date_in, status: 'tersedia', note: bulkNote.trim() || null, created_by: profile.id }))
      
      if (toInsert.length > 0) {
        const { data: insertedSns, error } = await supabase.from('serial_numbers').insert(toInsert).select()
        if (error) throw error
        await supabase.from('inventory_log').insert(insertedSns.map(sn => ({ log_date: form.date_in, item_type: 'sn', item_id: sn.id, action: 'masuk', quantity: 1, note: bulkNote.trim() || 'Input massal via text', created_by: profile.id })))
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Input Massal SN', detail: \`\${toInsert.length} SN ditambahkan\` })
      }
      
      toast.success(\`\${toInsert.length} berhasil ditambah, \${existing.length} sudah ada.\`)`;

const newBulk = `      const existingItems = items.filter(i => lines.includes(i.serial_number))
      const alreadyAvailable = existingItems.filter(i => i.status === 'tersedia')
      const toRecycle = existingItems.filter(i => i.status === 'terpakai')
      const toInsertList = lines.filter(sn => !existingItems.some(e => e.serial_number === sn))
      
      const toInsert = toInsertList.map(sn => ({ brand_id: brandId, type_id: typeId, serial_number: sn, date_in: form.date_in, status: 'tersedia', note: bulkNote.trim() || null, created_by: profile.id }))
      
      if (toInsert.length > 0) {
        const { data: insertedSns, error } = await supabase.from('serial_numbers').insert(toInsert).select()
        if (error) throw error
        await supabase.from('inventory_log').insert(insertedSns.map(sn => ({ log_date: form.date_in, item_type: 'sn', item_id: sn.id, action: 'masuk', quantity: 1, note: bulkNote.trim() || 'Input massal via text', created_by: profile.id })))
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Input Massal SN', detail: \`\${toInsert.length} SN ditambahkan\` })
      }

      if (toRecycle.length > 0) {
        const recycleIds = toRecycle.map(i => i.id)
        const { error: recErr } = await supabase.from('serial_numbers').update({ 
          status: 'tersedia', 
          date_in: form.date_in, 
          brand_id: brandId || undefined, 
          type_id: typeId || undefined,
          note: bulkNote.trim() || undefined,
          updated_at: new Date().toISOString()
        }).in('id', recycleIds)
        if (recErr) throw recErr
        await supabase.from('inventory_log').insert(recycleIds.map(id => ({ log_date: form.date_in, item_type: 'sn', item_id: id, action: 'masuk', quantity: 1, note: bulkNote.trim() || 'Dismantle/Kembali ke gudang (Bulk)', created_by: profile.id })))
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Recycle SN', detail: \`\${toRecycle.length} SN dikembalikan ke gudang\` })
      }
      
      let msg = []
      if (toInsert.length > 0) msg.push(\`\${toInsert.length} SN baru\`)
      if (toRecycle.length > 0) msg.push(\`\${toRecycle.length} SN recycle (dismantle)\`)
      if (alreadyAvailable.length > 0) msg.push(\`\${alreadyAvailable.length} SN diabaikan (sudah di gudang)\`)
      toast.success(msg.join(', '))`;

if (content.includes(oldBulk)) {
  content = content.replace(oldBulk, newBulk);
  console.log("Replaced bulk exact");
} else {
  content = content.replace(oldBulk.replace(/\r\n/g, '\n'), newBulk.replace(/\r\n/g, '\n'));
  console.log("Replaced bulk LF");
}

fs.writeFileSync('src/pages/inventory/SerialNumber.jsx', content);

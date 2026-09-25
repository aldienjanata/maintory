const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

let oldImport = `        // Handle Inserts
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          const { error } = await supabase.from('serial_numbers').insert(batch)
          if (error) throw new Error(\`Gagal menyimpan batch baru \${i/batchSize + 1}: \` + error.message)
          inserted += batch.length
          showProgress('Menyimpan ke Database', \`Menyimpan \${inserted} dari \${toInsert.length} SN baru...\`, 35 + (inserted / (toInsert.length+toRecycle.length)) * 65)
        }
        
        // Handle Recycles
        let recycled = 0
        for (let i = 0; i < toRecycle.length; i += batchSize) {
          const batch = toRecycle.slice(i, i + batchSize)
          for (let rec of batch) {
            await supabase.from('serial_numbers').update(rec).eq('id', rec.id)
          }
          recycled += batch.length
          showProgress('Mendaur Ulang Data', \`Mendaur ulang \${recycled} dari \${toRecycle.length} SN lama...\`, 35 + ((inserted + recycled) / (toInsert.length+toRecycle.length)) * 65)
        }`;

let newImport = `        // Handle Inserts
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          const { data: insertedSns, error } = await supabase.from('serial_numbers').insert(batch).select()
          if (error) throw new Error(\`Gagal menyimpan batch baru \${i/batchSize + 1}: \` + error.message)
          if (insertedSns && insertedSns.length > 0) {
            await supabase.from('inventory_log').insert(insertedSns.map(sn => ({ log_date: sn.date_in, item_type: 'sn', item_id: sn.id, action: 'masuk', quantity: 1, note: sn.note || 'Input massal via Excel', created_by: profile.id })))
          }
          inserted += batch.length
          showProgress('Menyimpan ke Database', \`Menyimpan \${inserted} dari \${toInsert.length} SN baru...\`, 35 + (inserted / (toInsert.length+toRecycle.length)) * 65)
        }
        
        // Handle Recycles
        let recycled = 0
        for (let i = 0; i < toRecycle.length; i += batchSize) {
          const batch = toRecycle.slice(i, i + batchSize)
          const logPayloads = []
          for (let rec of batch) {
            await supabase.from('serial_numbers').update(rec).eq('id', rec.id)
            logPayloads.push({ log_date: rec.date_in, item_type: 'sn', item_id: rec.id, action: 'masuk', quantity: 1, note: rec.note || 'Dismantle/Kembali ke gudang (Excel)', created_by: profile.id })
          }
          if (logPayloads.length > 0) await supabase.from('inventory_log').insert(logPayloads)
          recycled += batch.length
          showProgress('Mendaur Ulang Data', \`Mendaur ulang \${recycled} dari \${toRecycle.length} SN lama...\`, 35 + ((inserted + recycled) / (toInsert.length+toRecycle.length)) * 65)
        }`;

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  console.log("Replaced import log exact");
} else {
  content = content.replace(oldImport.replace(/\r\n/g, '\n'), newImport.replace(/\r\n/g, '\n'));
  console.log("Replaced import log LF");
}

fs.writeFileSync('src/pages/inventory/SerialNumber.jsx', content);

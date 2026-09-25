const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

let oldImport = `        const toInsert = data.map(row => {
          const sn = String(row['Serial Number'] || '').trim()
          if (!sn) return null
          const bId = brandMap[String(row['Merk'] || '').trim().toLowerCase()]
          const tName = String(row['Tipe'] || '').trim()
          let tId = null
          if (bId && tName) {
            const key = \`\${bId}_\${tName.toLowerCase()}\`
            tId = typeMap[key]
          }
          
          let parsedDate = format(new Date(), 'yyyy-MM-dd')
          const rawDate = row['Tanggal Masuk (yyyy-mm-dd)']
          const toDateStr = (d) => \`\${d.getUTCFullYear()}-\${String(d.getUTCMonth()+1).padStart(2,'0')}-\${String(d.getUTCDate()).padStart(2,'0')}\`
          if (rawDate instanceof Date) {
            parsedDate = toDateStr(rawDate)
          } else if (typeof rawDate === 'number') {
            // Excel serial: days since Dec 30, 1899
            const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000))
            if (!isNaN(d)) parsedDate = toDateStr(d)
          } else if (typeof rawDate === 'string' && rawDate.trim()) {
            const d = new Date(rawDate)
            if (!isNaN(d)) parsedDate = toDateStr(d)
          }

          return { serial_number: sn, date_in: parsedDate, status: 'tersedia', note: String(row['Note'] || '').trim(), brand_id: bId || null, type_id: tId, created_by: profile.id }
        }).filter(Boolean)
        
        let inserted = 0
        const batchSize = 50
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          const { error } = await supabase.from('serial_numbers').upsert(batch, { onConflict: 'serial_number', ignoreDuplicates: true })
          if (error) throw new Error(\`Gagal menyimpan batch \${i/batchSize + 1}: \` + error.message)
          inserted += batch.length
          showProgress('Menyimpan ke Database', \`Menyimpan \${inserted} dari \${toInsert.length} SN...\`, 35 + (inserted / toInsert.length) * 65)
        }
        toast.success('Import berhasil')`;

let newImport = `        const toInsert = []
        const toRecycle = []
        
        for (let row of data) {
          const sn = String(row['Serial Number'] || '').trim()
          if (!sn) continue
          const bId = brandMap[String(row['Merk'] || '').trim().toLowerCase()]
          const tName = String(row['Tipe'] || '').trim()
          let tId = null
          if (bId && tName) {
            const key = \`\${bId}_\${tName.toLowerCase()}\`
            tId = typeMap[key]
          }
          
          let parsedDate = format(new Date(), 'yyyy-MM-dd')
          const rawDate = row['Tanggal Masuk (yyyy-mm-dd)']
          const toDateStr = (d) => \`\${d.getUTCFullYear()}-\${String(d.getUTCMonth()+1).padStart(2,'0')}-\${String(d.getUTCDate()).padStart(2,'0')}\`
          if (rawDate instanceof Date) {
            parsedDate = toDateStr(rawDate)
          } else if (typeof rawDate === 'number') {
            const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000))
            if (!isNaN(d)) parsedDate = toDateStr(d)
          } else if (typeof rawDate === 'string' && rawDate.trim()) {
            const d = new Date(rawDate)
            if (!isNaN(d)) parsedDate = toDateStr(d)
          }

          const existingItem = items.find(i => i.serial_number.toLowerCase() === sn.toLowerCase())
          const noteStr = String(row['Note'] || '').trim()
          if (existingItem) {
            if (existingItem.status === 'terpakai') {
              toRecycle.push({
                id: existingItem.id,
                brand_id: bId || existingItem.brand_id,
                type_id: tId || existingItem.type_id,
                date_in: parsedDate,
                status: 'tersedia',
                note: noteStr || existingItem.note,
                updated_at: new Date().toISOString()
              })
            }
          } else {
            toInsert.push({ serial_number: sn, date_in: parsedDate, status: 'tersedia', note: noteStr || null, brand_id: bId || null, type_id: tId, created_by: profile.id })
          }
        }
        
        let inserted = 0
        const batchSize = 50
        
        // Handle Inserts
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
        }

        toast.success(\`Import selesai: \${toInsert.length} SN baru, \${toRecycle.length} SN didaur ulang.\`)`;

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  console.log("Replaced import exact");
} else {
  content = content.replace(oldImport.replace(/\r\n/g, '\n'), newImport.replace(/\r\n/g, '\n'));
  console.log("Replaced import LF");
}

fs.writeFileSync('src/pages/inventory/SerialNumber.jsx', content);

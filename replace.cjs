const fs = require('fs');
let content = fs.readFileSync('src/pages/dismantle/Dismantle.jsx', 'utf8');

// 1. setCloseForm initial state
content = content.replace(
  `const [closeForm, setCloseForm] = useState({ pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: [] })`,
  `const [closeForm, setCloseForm] = useState({ aksi: 'close', pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: [], note: '' })`
);

// 2. openCloseModal
content = content.replace(
  `setCloseForm({ pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: item.technicians || [] })`,
  `setCloseForm({ aksi: 'close', pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: item.technicians || [], note: item.note || '' })`
);

// 3. submitClose function
const submitCloseTarget = `  const submitClose = async () => {
    if (!closeForm.technicians.length) {
      toast.error('Pilih minimal 1 teknisi yang melakukan eksekusi close')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('dismantles').update({ 
      aksi: 'close', 
      pickup_date: closeForm.pickup_date, 
      technicians: closeForm.technicians,
      updated_at: new Date().toISOString() 
    }).eq('id', closeItem.id)
    
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Close Dismantle', detail: \`ID: \${closeItem.customer_id}\` })
      toast.success('Dismantle ditandai selesai')
      setIsCloseModalOpen(false)
      fetchAll()
    } else {
      toast.error('Gagal close: ' + error.message)
    }
    setSaving(false)
  }`;

const submitCloseReplacement = `  const submitClose = async () => {
    if (!closeForm.technicians.length) {
      toast.error('Pilih minimal 1 teknisi yang melakukan eksekusi')
      return
    }
    if (closeForm.aksi === 'pending' && !closeForm.note.trim()) {
      toast.error('Note wajib diisi untuk status Pending')
      return
    }
    setSaving(true)
    const updateData = { 
      aksi: closeForm.aksi, 
      technicians: closeForm.technicians,
      updated_at: new Date().toISOString() 
    }
    if (closeForm.aksi === 'close') {
      updateData.pickup_date = closeForm.pickup_date
      updateData.note = closeForm.note || ''
    } else if (closeForm.aksi === 'pending') {
      updateData.note = closeForm.note
    }

    const { error } = await supabase.from('dismantles').update(updateData).eq('id', closeItem.id)
    
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: closeForm.aksi === 'close' ? 'Close Dismantle' : 'Pending Dismantle', detail: \`ID: \${closeItem.customer_id}\` })
      toast.success(\`Dismantle ditandai \${closeForm.aksi}\`)
      setIsCloseModalOpen(false)
      fetchAll()
    } else {
      toast.error('Gagal update status: ' + error.message)
    }
    setSaving(false)
  }`;

content = content.replace(submitCloseTarget, submitCloseReplacement);

// 4. Desktop badges
content = content.replace(
  `{item.aksi === 'close' ? <span className=\"badge badge-success\"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'disable' ? <span className=\"badge badge-muted\"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className=\"badge badge-warning\"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className=\"badge badge-danger\"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className=\"badge badge-accent\"><CheckCircle size={10} /> Aktif</span>}`,
  `{item.aksi === 'close' ? <span className=\"badge badge-success\"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'pending' ? <span className=\"badge badge-info\" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Clock size={10} /> Pending</span> :
                         item.aksi === 'disable' ? <span className=\"badge badge-muted\"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className=\"badge badge-warning\"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className=\"badge badge-danger\"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className=\"badge badge-accent\"><CheckCircle size={10} /> Aktif</span>}`
);

// 5. Mobile badges
content = content.replace(
  `{item.aksi === 'close' ? <span className=\"badge badge-success\"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'disable' ? <span className=\"badge badge-muted\"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className=\"badge badge-warning\"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className=\"badge badge-danger\"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className=\"badge badge-accent\"><CheckCircle size={10} /> Aktif</span>}`,
  `{item.aksi === 'close' ? <span className=\"badge badge-success\"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'pending' ? <span className=\"badge badge-info\" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Clock size={10} /> Pending</span> :
                         item.aksi === 'disable' ? <span className=\"badge badge-muted\"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className=\"badge badge-warning\"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className=\"badge badge-danger\"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className=\"badge badge-accent\"><CheckCircle size={10} /> Aktif</span>}`
);

// 6. Action buttons
content = content.replace(
  `{item.aksi !== 'close' && (
                            <button className=\"btn-icon text-success\" title=\"Close Status\" onClick={() => openCloseModal(item)}><CheckCircle size={15} /></button>
                          )}`,
  `{item.aksi !== 'close' && (
                            <button className=\"btn-icon text-success\" title=\"Update Eksekusi\" onClick={() => openCloseModal(item)}><CheckCircle size={15} /></button>
                          )}`
);

content = content.replace(
  `{item.aksi !== 'close' && (
                              <button className=\"btn btn-secondary btn-sm text-success\" onClick={(e) => { e.stopPropagation(); openCloseModal(item) }}>
                                <CheckCircle size={14} /> Close Status
                              </button>
                            )}`,
  `{item.aksi !== 'close' && (
                              <button className=\"btn btn-secondary btn-sm text-success\" onClick={(e) => { e.stopPropagation(); openCloseModal(item) }}>
                                <CheckCircle size={14} /> Update Eksekusi
                              </button>
                            )}`
);

// 7. Edit Modal Options
content = content.replace(
  `<option value=\"close\">Close</option>
                    </select>`,
  `<option value=\"close\">Close</option>
                      <option value=\"pending\">Pending</option>
                    </select>`
);

// 8. Close Modal UI
const closeModalTarget = `              <div className=\"modal-header\">
                <h3>Close Status Dismantle</h3>
                <button className=\"btn-icon\" onClick={() => setIsCloseModalOpen(false)}><X size={18} /></button>
              </div>
              <div className=\"modal-body\" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                  Menandai <strong>{closeItem?.full_name}</strong> sebagai <strong>Close</strong> — pelanggan sudah close dan ONT sudah diambil.
                </div>
                <div className=\"form-group\">
                  <label className=\"form-label\">Pilih Teknisi Eksekutor <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {technicians.map(t => (
                      <button key={t.id} type=\"button\" onClick={() => toggleCloseTech(t.id)}
                        className={\`badge \${closeForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}\`}
                        style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}>
                        {t.full_name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className=\"form-group\">
                  <label className=\"form-label\">Tanggal Close</label>
                  <input type=\"date\" className=\"form-input\" value={closeForm.pickup_date} onChange={e => setCloseForm(f => ({ ...f, pickup_date: e.target.value }))} />
                </div>
              </div>
              <div className=\"modal-footer\">
                <button className=\"btn btn-secondary\" onClick={() => setIsCloseModalOpen(false)}>Batal</button>
                <button className=\"btn btn-primary\" onClick={submitClose} disabled={saving}>
                  {saving ? <span className=\"spinner\" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Close Status'}
                </button>
              </div>`;

const closeModalReplacement = `              <div className=\"modal-header\">
                <h3>Update Status Eksekusi</h3>
                <button className=\"btn-icon\" onClick={() => setIsCloseModalOpen(false)}><X size={18} /></button>
              </div>
              <div className=\"modal-body\" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className=\"form-group\">
                  <label className=\"form-label\">Status Eksekusi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className=\"form-input\" value={closeForm.aksi} onChange={e => setCloseForm(f => ({ ...f, aksi: e.target.value }))}>
                    <option value=\"close\">Close (ONT Terambil)</option>
                    <option value=\"pending\">Pending (Tertunda / Gagal Ambil)</option>
                  </select>
                </div>
                <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                  {closeForm.aksi === 'close' ? (
                    <>Menandai <strong>{closeItem?.full_name}</strong> sebagai <strong>Close</strong> — pelanggan sudah close dan ONT sudah diambil.</>
                  ) : (
                    <>Menandai <strong>{closeItem?.full_name}</strong> sebagai <strong>Pending</strong> — teknisi sudah ke rumah pelanggan tetapi ONT belum terambil.</>
                  )}
                </div>
                <div className=\"form-group\">
                  <label className=\"form-label\">Pilih Teknisi Eksekutor <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {technicians.map(t => (
                      <button key={t.id} type=\"button\" onClick={() => toggleCloseTech(t.id)}
                        className={\`badge \${closeForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}\`}
                        style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}>
                        {t.full_name}
                      </button>
                    ))}
                  </div>
                </div>
                {closeForm.aksi === 'close' && (
                  <div className=\"form-group\">
                    <label className=\"form-label\">Tanggal Close</label>
                    <input type=\"date\" className=\"form-input\" value={closeForm.pickup_date} onChange={e => setCloseForm(f => ({ ...f, pickup_date: e.target.value }))} />
                  </div>
                )}
                {closeForm.aksi === 'pending' && (
                  <div className=\"form-group\">
                    <label className=\"form-label\">Note / Alasan <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <textarea className=\"form-input\" placeholder=\"Alasan mengapa belum terambil (misal: rumah kosong, pelanggan pergi)\" rows=\"3\" value={closeForm.note} onChange={e => setCloseForm(f => ({ ...f, note: e.target.value }))}></textarea>
                  </div>
                )}
              </div>
              <div className=\"modal-footer\">
                <button className=\"btn btn-secondary\" onClick={() => setIsCloseModalOpen(false)}>Batal</button>
                <button className=\"btn btn-primary\" onClick={submitClose} disabled={saving}>
                  {saving ? <span className=\"spinner\" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Status'}
                </button>
              </div>`;

content = content.replace(closeModalTarget, closeModalReplacement);

fs.writeFileSync('src/pages/dismantle/Dismantle.jsx', content);
console.log('Replacements completed.');

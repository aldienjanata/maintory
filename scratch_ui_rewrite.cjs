const fs = require('fs');

function replaceReturn(file, componentName, icon, generateIdLabel, generateIdFuncStr, deviceFields, tableHeaders, tableRowCells, isDeviceRef = false, extraProps = '') {
  const code = fs.readFileSync('src/pages/jaringan/' + file + '.jsx', 'utf8');
  const lines = code.split('\n');
  const returnIdx = lines.findIndex(l => l.trim() === 'return (');
  const logicSection = lines.slice(0, returnIdx).join('\n');

  let bulkDeleteText = "SEMUA DATA";
  if (file === 'DataServer') bulkDeleteText = 'SEMUA DATA SERVER';
  if (file === 'DataClosure') bulkDeleteText = 'SEMUA DATA CLOSURE';
  if (file === 'DataJalurFo') bulkDeleteText = 'SEMUA JALUR FO';
  if (file === 'DataCoilan') bulkDeleteText = 'SEMUA DATA COILAN';
  if (file === 'DataKasetFo') bulkDeleteText = 'SEMUA DATA KASET FO';

  const newReturn = `  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            ${icon}
            ${componentName}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen ${componentName}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Tambah</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileSpreadsheet size={14} /> Template</button>
          {['admin', 'superadmin'].includes(role) && (
            <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button>
          )}
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setExcelMenuOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Excel <ChevronDown size={13} style={{ transform: excelMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
            </button>
            {excelMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setExcelMenuOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: '180px', overflow: 'hidden' }}>
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportExcel() }}><Download size={13} /> Export ke Excel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total Data', value: items.length, color: 'var(--accent)' },
          { label: 'Kecamatan', value: kecamatanList.length, color: 'var(--success)' },
          { label: 'Hasil Filter', value: filtered.length, color: 'var(--purple)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '12px 14px', borderTop: '3px solid ' + card.color }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '200px', maxWidth: '350px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: '30px', height: '34px', fontSize: '13px', width: '100%' }} placeholder="Cari data, ID, Desa..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1) }} />
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}><option value="">Semua Site</option>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }}><option value="">Semua Kecamatan</option>{kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setPage(1) }}><option value="">Semua Desa</option>{desaList.map(d => <option key={d} value={d}>{d}</option>)}</select>
          {(filterSite || filterKecamatan || filterDesa || searchQuery)
            ? <button className="btn btn-secondary btn-sm" style={{ height: '34px' }} onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterDesa(''); setSearchQuery(''); setPage(1) }}>Reset</button>
            : <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} data</div>
          }
        </div>
      </div>

      {/* BULK DELETE (superadmin) */}
      {role === 'superadmin' && (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '10px' }}>
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setBulkMenuOpen(o => !o)}>
            <Trash2 size={13} /> Hapus Massal
            {selectedIds.size > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '20px', padding: '0 6px', fontSize: '10px', fontWeight: 700 }}>{selectedIds.size}</span>}
            <ChevronDown size={13} style={{ transform: bulkMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
          </button>
          {bulkMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setBulkMenuOpen(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: '220px', overflow: 'hidden' }}>
                {selectedIds.size > 0 && (
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('selected') }}>
                    <CheckSquare size={14} /> Hapus Yang Dipilih ({selectedIds.size})
                  </button>
                )}
                <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('all') }}>
                  <Trash2 size={14} /> Hapus ${bulkDeleteText}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* TABLE */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada data ditemukan</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '900px', fontSize: '13px' }}>
              <thead>
                <tr>
                  {role === 'superadmin' && (
                    <th style={{ width: '36px', textAlign: 'center', cursor: 'pointer' }} onClick={toggleSelectAll}>
                      {paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))
                        ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
                        : <Square size={14} style={{ opacity: 0.4 }} />}
                    </th>
                  )}
                  <th style={{ width: '40px' }}>No</th>
                  ${tableHeaders}
                  <th>Dibuat Oleh</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>Tanggal <SortIcon col="created_at" /></th>
                  <th style={{ width: '80px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => {
                  ${extraProps}
                  return (
                    <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'rgba(59,130,246,0.06)' : undefined }}>
                      {role === 'superadmin' && (
                        <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(item.id)}>
                          {selectedIds.has(item.id) ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} style={{ opacity: 0.4 }} />}
                        </td>
                      )}
                      <td style={{ color: 'var(--text-secondary)' }}>{(page - 1) * perPage + idx + 1}</td>
                      ${tableRowCells}
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getUserName(item.created_by)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {['admin', 'superadmin', 'teknisi'].includes(role) && (
                            <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }} onClick={() => openEdit(item)}><Edit2 size={12} /></button>
                          )}
                          {role === 'superadmin' && (
                            <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(item)}><Trash2 size={12} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div style={{ marginTop: '12px' }}>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Hapus Data</h3><button className="btn-icon" onClick={() => setConfirmDelete(null)}><X size={18} /></button></div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
              <Trash2 size={40} style={{ color: 'var(--danger)', marginBottom: '12px' }} />
              <p style={{ marginBottom: '8px' }}>Hapus data ini?</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(confirmDelete)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRM MODAL */}
      {bulkDeleteModal && (
        <div className="modal-overlay" onClick={() => setBulkDeleteModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Konfirmasi Hapus Massal</h3><button className="btn-icon" onClick={() => setBulkDeleteModal(null)}><X size={18} /></button></div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>Anda akan menghapus: <strong style={{ color: 'var(--danger)' }}>{bulkDeleteModal.label}</strong></p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Ketik <strong>{bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}</strong> untuk konfirmasi:</p>
              <input className="form-input" value={bulkDeleteConfirmText} onChange={e => setBulkDeleteConfirmText(e.target.value)} placeholder={bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkDeleteModal(null)}>Batal</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleBulkDelete}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '640px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Data' : 'Tambah Data'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label className="form-label">Site *</label>
                  <select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {!editingId && (
                  <div className="form-group">
                    <label className="form-label">${generateIdLabel}</label>
                    <input className="form-input" placeholder="Biarkan kosong untuk auto-generate" value={form.${generateIdFuncStr} || ''} onChange={e => setForm(f => ({ ...f, ${generateIdFuncStr}: e.target.value }))} />
                  </div>
                )}
                ${deviceFields}
                <div className="form-group">
                  <label className="form-label">Kecamatan *</label>
                  <SearchableSelect value={form.kecamatan} onChange={val => setForm(f => ({ ...f, kecamatan: val, desa: '' }))} options={kecamatanOpts.map(k => ({ value: k, label: k }))} placeholder="Ketik atau pilih kecamatan..." allowNew />
                </div>
                <div className="form-group">
                  <label className="form-label">Desa/Kelurahan *</label>
                  <SearchableSelect value={form.desa} onChange={val => setForm(f => ({ ...f, desa: val }))} options={desaOpts.map(d => ({ value: d, label: d }))} placeholder="Ketik atau pilih desa..." allowNew />
                </div>
                <div className="form-group">
                  <label className="form-label">Jalan/Dusun/Gang</label>
                  <input className="form-input" placeholder="Jalan/Dusun/Gang" value={form.jalan} onChange={e => setForm(f => ({ ...f, jalan: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Google Maps URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" placeholder="Paste link Google Maps..." value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} style={{ flex: 1 }} />
                  <button className="btn btn-secondary btn-sm" onClick={handleExtractCoords} type="button"><MapPin size={14} /> Ekstrak</button>
                </div>
              </div>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label className="form-label">Latitude</label>
                  <input className="form-input" placeholder="-7.xxxx" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude</label>
                  <input className="form-input" placeholder="109.xxxx" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan</label>
                <textarea className="form-input" rows={3} placeholder="Catatan tambahan..." value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Data'}</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PREVIEW MODAL */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '900px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Preview Import ({importRows.length} baris)</h3>
              <button className="btn-icon" onClick={() => setIsImportModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input type="checkbox" checked={importRows.length > 0 && importRows.every(r => r._selected)} onChange={e => setImportRows(rows => rows.map(r => ({ ...r, _selected: e.target.checked })))} />
                      </th>
                      <th>Baris</th><th>ID Manual</th><th>Kecamatan</th><th>Desa</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} style={{ background: r._error ? 'rgba(239,68,68,0.06)' : undefined }}>
                        <td><input type="checkbox" checked={!!r._selected && !r._error} disabled={!!r._error} onChange={e => setImportRows(rows => rows.map((row, ri) => ri === i ? { ...row, _selected: e.target.checked } : row))} /></td>
                        <td style={{ color: 'var(--text-secondary)' }}>{r._rowNo}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.${generateIdFuncStr} || <span style={{ color: 'var(--text-secondary)' }}>auto</span>}</td>
                        <td>{r.kecamatan}</td>
                        <td>{r.desa}</td>
                        <td>{r._error ? <span style={{ color: 'var(--danger)', fontSize: '11px' }}>{r._error}</span> : <span style={{ color: 'var(--success)', fontSize: '11px' }}>OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={processImport} disabled={saving}>
                {saving ? 'Mengimport...' : 'Import ' + importRows.filter(r => r._selected && !r._error).length + ' data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}`;

  const finalCode = logicSection + '\n' + newReturn;
  fs.writeFileSync('src/pages/jaringan/' + file + '.jsx', finalCode);
  console.log(file + ' updated.');
}

// 1. DataCoilan
replaceReturn(
  'DataCoilan',
  'Data Coilan',
  '<img src="/icon_coilan.png" alt="coilan" style={{ width: "24px", height: "24px", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.8 }} />',
  'ID Coilan Manual',
  'coilan_id_manual',
  `<div className="form-group">
                  <label className="form-label">Panjang (meter)</label>
                  <input className="form-input" type="number" placeholder="cth: 50" value={form.panjang_meter} onChange={e => setForm(f => ({ ...f, panjang_meter: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tiang Terkait (Opsional)</label>
                  <SearchableSelect value={form.pole_id} onChange={val => setForm(f => ({ ...f, pole_id: val }))} options={poles.map(p => ({ value: p.id, label: p.pole_id + (p.desa ? ' - ' + p.desa : '') }))} placeholder="Pilih tiang yang terhubung..." />
                </div>`,
  `<th style={{ cursor: 'pointer' }} onClick={() => handleSort('coilan_id')}>Coilan ID <SortIcon col="coilan_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>Panjang (m) <SortIcon col="panjang_meter" /></th>
                  <th>Tiang Terkait</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Lokasi (Lat/Lon)</th>
                  <th>Maps</th>
                  <th>Keterangan</th>`,
  `<td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.coilan_id}</span></td>
                      <td>{item.panjang_meter ? item.panjang_meter + ' m' : '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{linkedPole ? linkedPole.pole_id : '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.latitude && item.longitude ? (Number(item.latitude).toFixed(5) + ', ' + Number(item.longitude).toFixed(5)) : '-'}
                      </td>
                      <td>
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} /><ExternalLink size={11} />
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>`,
  false,
  `const linkedPole = poles.find(p => p.id === item.pole_id)`
);

// 2. DataKasetFo
replaceReturn(
  'DataKasetFo',
  'Data Kaset FO',
  '<img src="/icon_kaset_fo.png" alt="kaset" style={{ width: "24px", height: "24px", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.8 }} />',
  'ID Kaset Manual',
  'kaset_id_manual',
  `<div className="form-group">
                  <label className="form-label">Jumlah Core</label>
                  <input className="form-input" type="number" placeholder="cth: 12" value={form.jumlah_core} onChange={e => setForm(f => ({ ...f, jumlah_core: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">ODP/ODC Terkait (Opsional)</label>
                  <SearchableSelect value={form.device_ref} onChange={val => setForm(f => ({ ...f, device_ref: val }))} options={devices.map(d => ({ value: d.id, label: d.device_id + (d.desa ? ' - ' + d.desa : '') }))} placeholder="Pilih ODP/ODC..." />
                </div>`,
  `<th style={{ cursor: 'pointer' }} onClick={() => handleSort('kaset_id')}>Kaset ID <SortIcon col="kaset_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('jumlah_core')}>Jumlah Core <SortIcon col="jumlah_core" /></th>
                  <th>ODP/ODC Terkait</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Lokasi (Lat/Lon)</th>
                  <th>Maps</th>
                  <th>Keterangan</th>`,
  `<td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.kaset_id}</span></td>
                      <td>{item.jumlah_core ? item.jumlah_core : '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{linkedDev ? linkedDev.device_id : '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.latitude && item.longitude ? (Number(item.latitude).toFixed(5) + ', ' + Number(item.longitude).toFixed(5)) : '-'}
                      </td>
                      <td>
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} /><ExternalLink size={11} />
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>`,
  true,
  `const linkedDev = devices.find(d => d.id === item.device_ref)`
);

// 3. DataServer
replaceReturn(
  'DataServer',
  'Data Server',
  '<Server size={24} style={{ opacity: 0.8 }} />',
  'ID Server Manual',
  'server_id_manual',
  `<div className="form-group">
                  <label className="form-label">Nama Server *</label>
                  <input className="form-input" placeholder="Nama server..." value={form.nama_server} onChange={e => setForm(f => ({ ...f, nama_server: e.target.value }))} />
                </div>`,
  `<th style={{ cursor: 'pointer' }} onClick={() => handleSort('server_id')}>Server ID <SortIcon col="server_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('nama_server')}>Nama Server <SortIcon col="nama_server" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Lokasi (Lat/Lon)</th>
                  <th>Maps</th>
                  <th>Keterangan</th>`,
  `<td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.server_id}</span></td>
                      <td>{item.nama_server || '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.latitude && item.longitude ? (Number(item.latitude).toFixed(5) + ', ' + Number(item.longitude).toFixed(5)) : '-'}
                      </td>
                      <td>
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} /><ExternalLink size={11} />
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>`,
  false,
  ''
);

// 4. DataClosure
replaceReturn(
  'DataClosure',
  'Data Closure',
  '<img src="/icon_closure.png" alt="closure" style={{ width: "24px", height: "24px", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.8 }} />',
  'ID Closure Manual',
  'closure_id_manual',
  `<div className="form-group">
                  <label className="form-label">Tipe Closure</label>
                  <select className="form-input" value={form.tipe} onChange={e => setForm(f => ({ ...f, tipe: e.target.value }))}>
                    <option value="">-- Pilih Tipe --</option>
                    <option value="Dome">Dome</option>
                    <option value="Fiber Splice Closure">Fiber Splice Closure</option>
                    <option value="Inline Closure">Inline Closure</option>
                    <option value="Horizontal">Horizontal</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Jumlah Core</label>
                  <input className="form-input" type="number" placeholder="cth: 12" value={form.jumlah_core} onChange={e => setForm(f => ({ ...f, jumlah_core: e.target.value }))} />
                </div>`,
  `<th style={{ cursor: 'pointer' }} onClick={() => handleSort('closure_id')}>Closure ID <SortIcon col="closure_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('tipe')}>Tipe <SortIcon col="tipe" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('jumlah_core')}>Jumlah Core <SortIcon col="jumlah_core" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Lokasi (Lat/Lon)</th>
                  <th>Maps</th>
                  <th>Keterangan</th>`,
  `<td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.closure_id}</span></td>
                      <td>{item.tipe || '-'}</td>
                      <td>{item.jumlah_core ? item.jumlah_core : '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.latitude && item.longitude ? (Number(item.latitude).toFixed(5) + ', ' + Number(item.longitude).toFixed(5)) : '-'}
                      </td>
                      <td>
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} /><ExternalLink size={11} />
                          </a>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>`,
  false,
  ''
);

// 5. DataJalurFo
replaceReturn(
  'DataJalurFo',
  'Data Jalur FO',
  '<Cable size={24} style={{ opacity: 0.8 }} />',
  'ID Jalur Manual',
  'jalur_id_manual',
  `<div className="form-group">
                  <label className="form-label">Nama Jalur *</label>
                  <input className="form-input" placeholder="Nama Jalur..." value={form.nama_jalur} onChange={e => setForm(f => ({ ...f, nama_jalur: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe Kabel</label>
                  <select className="form-input" value={form.tipe_kabel} onChange={e => setForm(f => ({ ...f, tipe_kabel: e.target.value }))}>
                    <option value="">-- Pilih Tipe --</option>
                    <option value="ADSS">ADSS</option>
                    <option value="FTTH">FTTH</option>
                    <option value="OPGW">OPGW</option>
                    <option value="UTP">UTP</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Panjang (meter)</label>
                  <input className="form-input" type="number" placeholder="cth: 50" value={form.panjang_meter} onChange={e => setForm(f => ({ ...f, panjang_meter: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Titik Awal</label>
                  <input className="form-input" placeholder="Titik Awal..." value={form.titik_awal} onChange={e => setForm(f => ({ ...f, titik_awal: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Titik Akhir</label>
                  <input className="form-input" placeholder="Titik Akhir..." value={form.titik_akhir} onChange={e => setForm(f => ({ ...f, titik_akhir: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Maps URL Awal</label>
                  <input className="form-input" placeholder="Maps URL Awal..." value={form.maps_url_awal} onChange={e => setForm(f => ({ ...f, maps_url_awal: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Maps URL Akhir</label>
                  <input className="form-input" placeholder="Maps URL Akhir..." value={form.maps_url_akhir} onChange={e => setForm(f => ({ ...f, maps_url_akhir: e.target.value }))} />
                </div>`,
  `<th style={{ cursor: 'pointer' }} onClick={() => handleSort('jalur_id')}>Jalur ID <SortIcon col="jalur_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('nama_jalur')}>Nama Jalur <SortIcon col="nama_jalur" /></th>
                  <th>Titik Awal</th>
                  <th>Titik Akhir</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>Panjang (m) <SortIcon col="panjang_meter" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('tipe_kabel')}>Tipe Kabel <SortIcon col="tipe_kabel" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Maps</th>
                  <th>Keterangan</th>`,
  `<td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.jalur_id}</span></td>
                      <td>{item.nama_jalur || '-'}</td>
                      <td>{item.titik_awal || '-'}</td>
                      <td>{item.titik_akhir || '-'}</td>
                      <td>{item.panjang_meter ? item.panjang_meter + ' m' : '-'}</td>
                      <td>{item.tipe_kabel || '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td>
                        {item.maps_url_awal || item.maps_url_akhir ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {item.maps_url_awal && (
                              <a href={item.maps_url_awal} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}>
                                <MapPin size={10} />Awal <ExternalLink size={10} />
                              </a>
                            )}
                            {item.maps_url_akhir && (
                              <a href={item.maps_url_akhir} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}>
                                <MapPin size={10} />Akhir <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>`,
  false,
  ''
);


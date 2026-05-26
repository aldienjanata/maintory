import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Cek update kode setiap 30 detik di background
      r && setInterval(() => r.update(), 30 * 1000)
    },
  })

  useEffect(() => {
    // Jika ada versi kode terbaru dari Vercel, otomatis muat ulang (tanpa tombol ribet)
    if (needRefresh) {
      updateServiceWorker(true).then(() => {
        window.location.href = window.location.href
        window.location.reload(true)
      })
    }
  }, [needRefresh, updateServiceWorker])

  // Komponen ini berjalan diam-diam (silent), tidak ada banner yang muncul
  return null
}

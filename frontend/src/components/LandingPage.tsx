import React from 'react'

interface LandingPageProps {
  onStartLocalRoom: () => void
  onStartRemoteRoom: () => void
  onOpenDictionary: () => void
  onOpenAccuracyTest: () => void
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartLocalRoom,
  onStartRemoteRoom,
  onOpenDictionary,
  onOpenAccuracyTest,
}) => {
  return (
    <div className="max-w-5xl mx-auto space-y-12 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-4 pb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
          GEMASTIK XIX 2026 — Divisi VIII Pengembangan Perangkat Lunak
        </div>

        <div className="space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            IsyaRasa — Penerjemah Bahasa Isyarat BISINDO Real-Time
          </h1>
          <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed">
            Menghubungkan penyandang Tuli dan masyarakat dengar secara dua arah: 
            <span className="font-semibold text-slate-800"> Gerakan Isyarat ➔ Teks & Suara</span>, serta 
            <span className="font-semibold text-slate-800"> Teks/Suara ➔ Rangkaian Video Isyarat</span>. 
            Langsung dari browser tanpa perantara juru bahasa.
          </p>
        </div>

        {/* Primary CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button onClick={onStartLocalRoom} className="btn-primary text-sm px-6 py-3 shadow-sm">
            <span>🖐️</span> Buka Room Lokal (Tatap Muka)
          </button>
          <button onClick={onStartRemoteRoom} className="btn-secondary text-sm px-6 py-3">
            <span>📹</span> Panggilan Remote (WebRTC P2P)
          </button>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="card p-6 space-y-3 hover:border-slate-300 transition-colors">
          <div className="h-10 w-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 text-xl font-bold">
            ⚡
          </div>
          <h3 className="text-base font-bold text-slate-900">Architecture 2-Lapis AI</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Mengkombinasikan Computer Vision (MediaPipe + TF.js) untuk ekstraksi 21 landmark tangan dan LLM (9Router) untuk menyusun gloss menjadi kalimat Indonesia yang alami.
          </p>
        </div>

        <div className="card p-6 space-y-3 hover:border-slate-300 transition-colors">
          <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 text-xl font-bold">
            🛡️
          </div>
          <h3 className="text-base font-bold text-slate-900">Degradasi Anggun (Offline)</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Jika jaringan terputus atau backend offline, deteksi isyarat MediaPipe tetap berjalan 100% lokal di browser dan menampilkan gloss kata secara aman tanpa crash.
          </p>
        </div>

        <div className="card p-6 space-y-3 hover:border-slate-300 transition-colors">
          <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xl font-bold">
            🎥
          </div>
          <h3 className="text-base font-bold text-slate-900">WebRTC Video Call P2P</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Komunikasi jarak jauh 1-lawan-1 tanpa delay. Stream video langsung diolah oleh engine landmark lokal, menyiarkan teks hasil penerjemahan ke lawan bicara.
          </p>
        </div>
      </section>

      {/* Quick Action Utility Bar */}
      <section className="card p-5 bg-white flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-slate-900">Uji Coba & Perangkat Evaluasi</h4>
          <p className="text-xs text-slate-500">
            Jelajahi 32 kata kamus BISINDO atau jalankan pengujian akurasi model TensorFlow.js.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onOpenDictionary} className="btn-secondary text-xs">
            📖 32 Label Kamus
          </button>
          <button onClick={onOpenAccuracyTest} className="btn-secondary text-xs">
            📊 Uji Akurasi Model
          </button>
        </div>
      </section>
    </div>
  )
}

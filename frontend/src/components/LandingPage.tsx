import React from 'react'
import { Video, PhoneCall, BookOpen, ArrowRight } from 'lucide-react'

interface LandingPageProps {
  onStartLocalRoom: () => void
  onStartRemoteRoom: () => void
  onOpenDictionary: () => void
  onOpenAccuracyTest?: () => void
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartLocalRoom,
  onStartRemoteRoom,
  onOpenDictionary,
  onOpenAccuracyTest: _onOpenAccuracyTest,
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      {/* Hero Header */}
      <section className="text-center space-y-3 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/70 text-xs font-semibold text-teal-800 shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
          Aplikasi Komunikasi Inklusif BISINDO
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
            IsyaRasa
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-600 max-w-xl mx-auto leading-relaxed">
            Menghubungkan Teman Tuli & Dengar Secara Langsung & Mudah
          </p>
        </div>
      </section>

      {/* Main Action Cards (2 Columns) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Bicara Langsung (Tatap Muka) */}
        <div
          onClick={onStartLocalRoom}
          className="group relative cursor-pointer rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs hover:shadow-md hover:border-teal-500/50 transition-all duration-200 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="h-12 w-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 group-hover:scale-105 transition-transform">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
                Bicara Langsung (Tatap Muka)
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Penerjemah langsung via kamera. Cukup gerakan isyarat di depan kamera untuk langsung dibacakan suaranya.
              </p>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-2 text-xs font-bold text-teal-600 group-hover:translate-x-1 transition-transform">
            <span>Buka Kamera Penerjemah</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Panggilan Video Jarak Jauh */}
        <div
          onClick={onStartRemoteRoom}
          className="group relative cursor-pointer rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs hover:shadow-md hover:border-slate-800/40 transition-all duration-200 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 group-hover:scale-105 transition-transform">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                Panggilan Video Jarak Jauh
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Bicara jarak jauh lewat panggilan video. Gerakan isyarat Anda otomatis diterjemahkan ke lawan bicara.
              </p>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-2 text-xs font-bold text-slate-900 group-hover:translate-x-1 transition-transform">
            <span>Mulai Panggilan Video</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </section>

      {/* Footer Utility Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/70 text-xs text-slate-500">
        <span className="font-medium">Panduan & Kosakata:</span>
        <div className="flex items-center gap-2">
          <button onClick={onOpenDictionary} className="btn-secondary text-xs py-1.5 px-3">
            <BookOpen className="w-3.5 h-3.5 mr-1 inline" /> Kamus 32 Kata Isyarat
          </button>
        </div>
      </section>
    </div>
  )
}

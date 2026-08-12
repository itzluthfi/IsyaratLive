import React from 'react'
import { Video, Globe, Zap, ShieldCheck, MessageSquare, BookOpen, FlaskConical, ArrowRight } from 'lucide-react'

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
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      {/* Hero Header */}
      <section className="text-center space-y-4 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/70 text-xs font-semibold text-teal-800 shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
          GEMASTIK XIX 2026 — Engine BISINDO Real-Time
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
            IsyaRasa
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-600 max-w-xl mx-auto leading-relaxed">
            Penerjemah Bahasa Isyarat BISINDO Dua Arah Real-Time
          </p>
        </div>
      </section>

      {/* Main Action Cards (2 Columns) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Room Lokal */}
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
                Room Lokal (Tatap Muka)
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Penerjemah langsung via kamera lokal. Cocok untuk percakapan tatap muka secara langsung.
              </p>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-2 text-xs font-bold text-teal-600 group-hover:translate-x-1 transition-transform">
            <span>Buka Room Kamera</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Panggilan Remote */}
        <div
          onClick={onStartRemoteRoom}
          className="group relative cursor-pointer rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs hover:shadow-md hover:border-slate-800/40 transition-all duration-200 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 group-hover:scale-105 transition-transform">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                Panggilan Remote (P2P)
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Video call jarak jauh via WebRTC dengan penerjemah otomatis secara dua arah.
              </p>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-2 text-xs font-bold text-slate-900 group-hover:translate-x-1 transition-transform">
            <span>Mulai Panggilan Video</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </section>

      {/* Modern Compact Feature Pills */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-slate-200/80 p-4 flex items-center gap-3 shadow-2xs">
          <div className="h-9 w-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">AI Dual-Engine</h4>
            <p className="text-[11px] text-slate-500">Computer Vision & LLM v7</p>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-4 flex items-center gap-3 shadow-2xs">
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">100% On-Device</h4>
            <p className="text-[11px] text-slate-500">Privasi & deteksi lokal offline</p>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200/80 p-4 flex items-center gap-3 shadow-2xs">
          <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Komunikasi 2 Arah</h4>
            <p className="text-[11px] text-slate-500">Isyarat ➔ Suara & Suara ➔ Video</p>
          </div>
        </div>
      </section>

      {/* Footer Utility Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/70 text-xs text-slate-500">
        <span className="font-medium">Perangkat Evaluasi & Kamus:</span>
        <div className="flex items-center gap-2">
          <button onClick={onOpenDictionary} className="btn-secondary text-xs py-1.5 px-3">
            <BookOpen className="w-3.5 h-3.5 mr-1 inline" /> 32 Label Kamus
          </button>
          <button onClick={onOpenAccuracyTest} className="btn-secondary text-xs py-1.5 px-3">
            <FlaskConical className="w-3.5 h-3.5 mr-1 inline" /> Uji Akurasi Model
          </button>
        </div>
      </section>
    </div>
  )
}

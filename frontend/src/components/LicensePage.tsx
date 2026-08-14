import { useEffect, useState } from 'react'
import { Scale, FileText, ArrowLeft, ExternalLink, CheckCircle2, ShieldCheck } from 'lucide-react'

export function LicensePage({ onBack }: { onBack: () => void }) {
  const [licenseText, setLicenseText] = useState<string>('Memuat data lisensi...')

  useEffect(() => {
    fetch('/LICENSE.txt')
      .then((res) => res.text())
      .then((text) => setLicenseText(text))
      .catch(() => {
        setLicenseText('Gagal memuat file LICENSE.txt.')
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 card p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Lisensi & Adopsi Komponen Perangkat Lunak</h1>
            <p className="text-xs text-slate-500">
              URL Route: <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">/license</code> &amp; <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">/api/license</code>
            </p>
          </div>
        </div>

        <button onClick={onBack} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4">
          <ArrowLeft className="w-4 h-4" /> Kembali ke Beranda
        </button>
      </div>

      {/* Overview Banner */}
      <div className="card p-5 bg-slate-900 text-white space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Lisensi Hak Cipta &amp; Kepatuhan Open Source</h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Aplikasi <strong>IsyaRasa (IsyaratLive)</strong> dikembangkan oleh Tim Doa Ibu (ITATS) di bawah <strong>Lisensi MIT</strong>. Seluruh pustaka, framework, dan dataset pihak ketiga diadopsi sesuai lisensi masing-masing (MIT, Apache 2.0, BSD, dan CC BY-NC 4.0).
        </p>
        <div className="pt-1 flex flex-wrap gap-3 text-xs">
          <a
            href="/LICENSE.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-teal-300 hover:text-white font-semibold underline underline-offset-2"
          >
            <FileText className="w-3.5 h-3.5" /> Buka Teks Mentah (LICENSE.txt) <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="/api/license"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-teal-300 hover:text-white font-semibold underline underline-offset-2"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Backend Route (/api/license)
          </a>
        </div>
      </div>

      {/* Raw License Text Box */}
      <div className="card p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-600" /> Isi Lengkap Dokumentasi LICENSE &amp; Tabel Adopsi
        </h3>
        <pre className="p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[60vh] border border-slate-800 select-all">
          {licenseText}
        </pre>
      </div>

      {/* Academic Citation Footnote */}
      <div className="card p-4 bg-slate-50 border border-slate-200 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold text-slate-900">Kepatuhan Lisensi Dataset WL-BISINDO (CC BY-NC 4.0):</p>
          <p className="text-slate-600 font-mono">
            Kindy, G. O., Leonali, G., &amp; Lucky, H. (2025). WL-BISINDO: A Word-Level Bahasa Isyarat Indonesia Dataset. <em>Procedia Computer Science</em>, Elsevier. DOI: 10.1016/j.procs.2025.08.277.
          </p>
        </div>
      </div>
    </div>
  )
}

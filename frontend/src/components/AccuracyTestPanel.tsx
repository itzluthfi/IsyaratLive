import { useState } from 'react'
import { GLOSS_MODEL_VERSIONS, GLOSS_MODEL_INFO, LATEST_GLOSS_MODEL, type GlossModelVersion } from './GlossClassifier'
import { runModelSelfTest, type SelfTestResult } from '../lib/modelSelfTest'

interface AccuracyTestPanelProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Panel uji akurasi per model — dijalankan langsung di browser terhadap 32
 * video dictionary sebagai ground-truth pengganti. Ini SANITY CHECK, bukan
 * evaluasi Signer-Independent resmi (itu seharusnya dilakukan saat training
 * di ml/, lihat PRD §9 & §15.6/15.7). Tujuannya supaya klaim akurasi di UI
 * selalu berdasar angka yang benar-benar diukur, bukan ditulis manual.
 */
export function AccuracyTestPanel({ isOpen, onClose }: AccuracyTestPanelProps) {
  const [version, setVersion] = useState<GlossModelVersion>(LATEST_GLOSS_MODEL)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<SelfTestResult | null>(null)

  if (!isOpen) return null

  async function handleRun() {
    setRunning(true)
    setResult(null)
    try {
      const res = await runModelSelfTest(version, (done, total, label) => setProgress({ done, total, label }))
      setResult(res)
    } catch (err) {
      console.error('Uji akurasi gagal:', err)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div>
            <h2 className="text-lg font-bold">Uji Akurasi Model</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sanity check terhadap 32 video dictionary — bukan evaluasi Signer-Independent resmi.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {GLOSS_MODEL_VERSIONS.map((v) => (
              <button
                key={v}
                onClick={() => setVersion(v)}
                disabled={running}
                className={version === v ? 'tab-pill-active' : 'tab-pill'}
              >
                {GLOSS_MODEL_INFO[v].label}
              </button>
            ))}
            <button onClick={handleRun} disabled={running} className="btn-primary ml-auto text-sm">
              {running ? 'Menguji…' : 'Jalankan Uji'}
            </button>
          </div>

          {running && progress && (
            <div className="mb-4">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Menguji {progress.done}/{progress.total} — {progress.label}
              </p>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-3">
              <div className="card p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Hasil {GLOSS_MODEL_INFO[result.version].label}</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {(result.accuracy * 100).toFixed(1)}%{' '}
                    <span className="text-sm font-normal text-slate-400">
                      ({result.correct}/{result.total} benar)
                    </span>
                  </p>
                </div>
                <span className="badge-neutral">Sanity check, bukan skema SI resmi</span>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Label Asli</th>
                      <th className="text-left px-3 py-2">Prediksi</th>
                      <th className="text-right px-3 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perItem.map((item) => (
                      <tr key={item.label} className={item.correct ? '' : 'bg-rose-50/60'}>
                        <td className="px-3 py-1.5 text-slate-800">{item.label}</td>
                        <td className={`px-3 py-1.5 ${item.correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {item.predicted}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-500 font-mono text-xs">
                          {(item.confidence * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!result && !running && (
            <p className="text-sm text-slate-500">
              Pilih model lalu klik "Jalankan Uji". Setiap dari 32 video dictionary akan diklasifikasi
              ulang oleh model terpilih dan dibandingkan dengan label aslinya, langsung di browser ini.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

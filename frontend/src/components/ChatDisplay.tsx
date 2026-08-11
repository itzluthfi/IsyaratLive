import type { ConversationMessage } from '../lib/api'

interface ChatDisplayProps {
  messages: ConversationMessage[]
  liveGloss?: string[]
  degraded?: boolean
  onToggleMode?: () => void
}

/** Tampilan teks hasil normalisasi + riwayat percakapan Room yang bisa di-scroll. */
export function ChatDisplay({ messages, liveGloss, degraded, onToggleMode }: ChatDisplayProps) {
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleSpeakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'id-ID'
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Banner Mode Instan / Offline Degradasi */}
      {degraded && (
        <div className="badge-warning w-full flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>
              <strong>Mode Instan Per Kata (Offline):</strong> Menampilkan kata isyarat langsung tanpa LLM.
            </span>
          </div>
          {onToggleMode && (
            <button onClick={onToggleMode} className="btn-primary text-xs px-2.5 py-1">
              Aktifkan LLM
            </button>
          )}
        </div>
      )}

      {/* Banner Deteksi Real-Time */}
      {liveGloss && liveGloss.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-900 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-500 animate-ping"></span>
            <span>Deteksi real-time: <strong className="font-semibold">{liveGloss.join(' -> ')}</strong></span>
          </div>
          <span className="text-[10px] text-teal-700 font-mono">Live</span>
        </div>
      )}

      {/* List Activity Feed Messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[460px] pr-1">
        {messages.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/50 text-slate-400 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">Belum Ada Percakapan</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Peragakan isyarat di depan kamera atau ketik kalimat untuk mulai menerjemahkan.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isFromSign = m.direction !== 'text-to-sign'
          return (
            <div key={m.id} className="card p-3.5 hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={isFromSign ? 'badge-accent' : 'badge-neutral'}>
                  {isFromSign ? 'Isyarat -> Teks' : 'Teks -> Isyarat'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <p className="text-base font-semibold text-slate-900 leading-snug">{m.text}</p>

              <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="font-mono text-[11px] text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/60 truncate max-w-[200px]">
                  Gloss: {m.gloss.join(' + ')}
                </span>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleSpeakText(m.text)}
                    className="px-2 py-1 rounded text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200"
                    title="Bacakan Suara (TTS)"
                  >
                    Suara
                  </button>
                  <button 
                    onClick={() => handleCopyText(m.text)}
                    className="px-2 py-1 rounded text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-slate-200"
                    title="Salin Teks"
                  >
                    Salin
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


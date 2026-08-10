import type { ConversationMessage } from '../lib/api'

interface ChatDisplayProps {
  messages: ConversationMessage[]
  liveGloss?: string[]
  degraded?: boolean
  onToggleMode?: () => void
}

/** Tampilan teks hasil normalisasi + riwayat percakapan yang bisa di-scroll. */
export function ChatDisplay({ messages, liveGloss, degraded, onToggleMode }: ChatDisplayProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      {degraded && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span>
              <strong>Mode Instan Per Kata (Degradasi) Aktif:</strong> Menampilkan kata isyarat langsung tanpa penyusunan kalimat LLM.
            </span>
          </div>
          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              ✨ Aktifkan Mode Kalimat (LLM)
            </button>
          )}
        </div>
      )}

      {liveGloss && liveGloss.length > 0 && (
        <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-sm text-indigo-700 font-medium animate-pulse">
          🔍 Deteksi real-time: {liveGloss.join(' → ')}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-1">
        {messages.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-gray-400">
            <p className="text-sm">Belum ada percakapan</p>
            <p className="text-xs text-gray-400">Peragakan isyarat tangan di depan kamera</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm transition-all hover:shadow-md">
            <p className="text-base font-medium text-gray-900">{m.text}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">Gloss: {m.gloss.join(' + ')}</span>
              <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

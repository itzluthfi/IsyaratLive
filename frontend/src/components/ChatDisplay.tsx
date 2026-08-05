import type { ConversationMessage } from '../lib/api'

interface ChatDisplayProps {
  messages: ConversationMessage[]
  liveGloss?: string[]
  degraded?: boolean
}

/** Tampilan teks hasil normalisasi + riwayat percakapan yang bisa di-scroll. */
export function ChatDisplay({ messages, liveGloss, degraded }: ChatDisplayProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      {degraded && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Mode degradasi: koneksi ke server terputus, menampilkan gloss mentah tanpa penyusunan kalimat.
        </div>
      )}

      {liveGloss && liveGloss.length > 0 && (
        <div className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">
          {liveGloss.join(' ')}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400">Belum ada percakapan</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg bg-white px-4 py-2 shadow-sm">
            <p className="text-base text-gray-900">{m.text}</p>
            <p className="mt-1 text-xs text-gray-400">{m.gloss.join(' + ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { SignToTextMode, type SignToTextModeHandle } from '../modes/SignToTextMode'
import { TextToSignMode } from '../modes/TextToSignMode'
import { ChatDisplay } from '../components/ChatDisplay'
import { fetchHistory, type ConversationMessage } from '../lib/api'

type InputPanel = 'sign-to-text' | 'text-to-sign'

interface RoomLocalProps {
  onOpenDictionaryModal: () => void
  wordToSign?: string
}

/**
 * Room Lokal — satu perangkat dipakai tatap muka oleh dua orang (PRD §3),
 * digambar sebagai "room" percakapan: satu feed obrolan bersama, panel
 * input bisa ditukar antara kamera (isyarat -> teks) dan teks/suara
 * (teks -> isyarat). Deteksi isyarat & logika klasifikasi TIDAK diubah.
 */
export function RoomLocal({ onOpenDictionaryModal, wordToSign }: RoomLocalProps) {
  const [panel, setPanel] = useState<InputPanel>('sign-to-text')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [liveStatus, setLiveStatus] = useState<{ liveGloss: string[]; degraded: boolean }>({
    liveGloss: [],
    degraded: false,
  })
  const signModeRef = useRef<SignToTextModeHandle>(null)

  useEffect(() => {
    fetchHistory()
      .then((history) => setMessages(history.slice().reverse()))
      .catch(() => {
        // Riwayat MySQL belum tersedia (backend/DB belum jalan) — Room tetap
        // berfungsi tanpa riwayat lama.
      })
  }, [])

  useEffect(() => {
    if (wordToSign) {
      setPanel('text-to-sign')
    }
  }, [wordToSign])

  const addMessage = (message: ConversationMessage) => {
    setMessages((prev) => [...prev, message])
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controller Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 card p-3">
        <div className="flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200/80 gap-1">
          <button
            onClick={() => setPanel('sign-to-text')}
            className={panel === 'sign-to-text' ? 'tab-pill-active' : 'tab-pill'}
          >
            Kamera -&gt; Teks &amp; Suara
          </button>
          <button
            onClick={() => setPanel('text-to-sign')}
            className={panel === 'text-to-sign' ? 'tab-pill-active' : 'tab-pill'}
          >
            Teks/Suara -&gt; Isyarat
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-neutral text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Room Lokal (Tatap Muka)
          </span>
        </div>
      </div>

      {/* Main Split View Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-start">
        <div className={panel === 'sign-to-text' ? 'space-y-4' : 'hidden'}>
          <SignToTextMode
            ref={signModeRef}
            onOpenDictionaryModal={onOpenDictionaryModal}
            onAddMessage={addMessage}
            onLiveStatusChange={setLiveStatus}
          />
        </div>
        <div className={panel === 'text-to-sign' ? 'space-y-4' : 'hidden'}>
          <TextToSignMode
            onOpenDictionaryModal={onOpenDictionaryModal}
            initialInput={wordToSign}
            onAddMessage={addMessage}
          />
        </div>

        <ChatDisplay
          messages={messages}
          liveGloss={panel === 'sign-to-text' ? liveStatus.liveGloss : undefined}
          degraded={panel === 'sign-to-text' ? liveStatus.degraded : false}
          onToggleMode={() => signModeRef.current?.disableForcedDegraded()}
        />
      </div>
    </div>
  )
}


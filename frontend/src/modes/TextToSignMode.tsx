import { useState } from 'react'
import { isSpeechRecognitionSupported, listenOnce } from '../components/SpeechOutput'

// Dictionary kata -> path video isyarat. Diisi setelah dictionary/ (32 video/GIF)
// direkam dan disalin ke frontend/public/dictionary/ (lihat PRD Fase 4).
const SIGN_DICTIONARY: Record<string, string> = {}

/** Mode 2: suara/teks -> rangkaian video isyarat dari dictionary. */
export function TextToSignMode() {
  const [input, setInput] = useState('')
  const [words, setWords] = useState<string[]>([])

  function handleSubmit(text: string) {
    const keywords = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
    setWords(keywords)
  }

  async function handleListen() {
    try {
      const transcript = await listenOnce()
      setInput(transcript)
      handleSubmit(transcript)
    } catch (err) {
      console.error('STT gagal:', err)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
          placeholder="Ketik kalimat…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit(input)}
        />
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-white"
          onClick={() => handleSubmit(input)}
        >
          Tampilkan
        </button>
        {isSpeechRecognitionSupported() && (
          <button
            className="rounded-md border border-gray-300 px-4 py-2"
            onClick={handleListen}
          >
            🎤
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {words.map((word, i) => {
          const src = SIGN_DICTIONARY[word]
          return (
            <div key={`${word}-${i}`} className="w-40 rounded-lg border border-gray-200 p-2 text-center">
              {src ? (
                <video src={src} className="aspect-square w-full rounded object-cover" autoPlay loop muted />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded bg-gray-100 text-sm text-gray-400">
                  belum ada video
                </div>
              )}
              <p className="mt-1 text-sm">{word}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

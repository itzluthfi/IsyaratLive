import { useState, useRef, useEffect, useCallback } from 'react'
import { isSpeechRecognitionSupported, listenOnce } from '../components/SpeechOutput'
import { parseTextToSignTokens, SIGN_DICTIONARY_DATA } from '../lib/signDictionary'
import type { ConversationMessage } from '../lib/api'
import { Mic } from 'lucide-react'

interface TextToSignModeProps {
  onOpenDictionaryModal?: () => void
  initialInput?: string
  /** Dipanggil setiap kali kalimat baru berhasil di-submit, untuk dicatat di feed obrolan Room bersama. */
  onAddMessage?: (message: ConversationMessage) => void
}

export function TextToSignMode({ onOpenDictionaryModal, initialInput = '', onAddMessage }: TextToSignModeProps) {
  const [input, setInput] = useState(initialInput)
  const [tokens, setTokens] = useState<ReturnType<typeof parseTextToSignTokens>>([])

  // Index kata aktif yang sedang diputar
  const [activeValidIndex, setActiveValidIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [isLoopSentence, setIsLoopSentence] = useState<boolean>(true)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)
  const [videoError, setVideoError] = useState<string | null>(null)

  // Dual player refs untuk transisi mulus tanpa layar hitam
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0)
  const videoRef0 = useRef<HTMLVideoElement>(null)
  const videoRef1 = useRef<HTMLVideoElement>(null)

  // Filter daftar kata yang memiliki file video di dictionary
  const validTokens = tokens.filter((t) => t.videoUrl !== null)
  const validTokensRef = useRef(validTokens)
  validTokensRef.current = validTokens

  const activeIndexRef = useRef(activeValidIndex)
  activeIndexRef.current = activeValidIndex

  const isLoopRef = useRef(isLoopSentence)
  isLoopRef.current = isLoopSentence

  // Preload semua video dalam kalimat untuk playback instan tanpa buffering
  useEffect(() => {
    validTokens.forEach((t) => {
      if (t.videoUrl) {
        const link = document.createElement('link')
        link.rel = 'preload'
        link.as = 'video'
        link.href = t.videoUrl
        document.head.appendChild(link)
      }
    })
  }, [validTokens])

  const handleSubmit = useCallback(
    (text: string) => {
      const parsed = parseTextToSignTokens(text)
      setTokens(parsed)
      setActiveValidIndex(0)
      setIsPlaying(true)
      setVideoError(null)

      const validCount = parsed.filter((t) => t.videoUrl !== null).length
      if (validCount > 0 && onAddMessage) {
        onAddMessage({
          id: Date.now(),
          gloss: parsed.map((t) => t.labelName ?? t.originalWord),
          text,
          createdAt: new Date().toISOString(),
          direction: 'text-to-sign',
        })
      }
    },
    [onAddMessage],
  )

  useEffect(() => {
    if (initialInput) {
      setInput(initialInput)
      handleSubmit(initialInput)
    }
  }, [initialInput, handleSubmit])

  const activeToken = validTokens[activeValidIndex]

  const transitioningRef = useRef<boolean>(false)

  // Preload video kata berikutnya ke idle player
  useEffect(() => {
    if (validTokens.length === 0) return

    const currentToken = validTokens[activeValidIndex]
    const nextTokenIndex = (activeValidIndex + 1) % validTokens.length
    const nextToken = validTokens[nextTokenIndex]

    const activeVid = activePlayerIndex === 0 ? videoRef0.current : videoRef1.current
    const idleVid = activePlayerIndex === 0 ? videoRef1.current : videoRef0.current

    // Set active video src jika belum sesuai
    if (activeVid && currentToken?.videoUrl) {
      const activeSrc = new URL(currentToken.videoUrl, window.location.href).href
      if (activeVid.src !== activeSrc) {
        activeVid.src = currentToken.videoUrl
        activeVid.currentTime = 0
      }
      activeVid.playbackRate = playbackSpeed
      if (isPlaying) {
        activeVid.play().catch(() => {})
      }
    }

    // Preload video berikutnya ke idle player
    if (idleVid && nextToken?.videoUrl && (validTokens.length > 1 || isLoopSentence)) {
      const nextSrc = new URL(nextToken.videoUrl, window.location.href).href
      if (idleVid.src !== nextSrc) {
        idleVid.src = nextToken.videoUrl
        idleVid.preload = 'auto'
        idleVid.load()
      }
    }

    transitioningRef.current = false
  }, [activeValidIndex, validTokens, isLoopSentence, playbackSpeed, isPlaying, activePlayerIndex])

  // Respon perubahan status Play/Pause atau Speed secara manual
  useEffect(() => {
    const activeVid = activePlayerIndex === 0 ? videoRef0.current : videoRef1.current
    if (!activeVid) return

    activeVid.playbackRate = playbackSpeed

    if (isPlaying) {
      activeVid.play().catch(() => {})
    } else {
      activeVid.pause()
    }
  }, [isPlaying, playbackSpeed, activePlayerIndex])

  // Transisi awal (Early-Start 180ms): Pemicu pemutaran video berikutnya 180ms sebelum video 1 selesai untuk pergantian tanpa jeda
  const handleTimeUpdate = (playerIndex: number) => {
    if (playerIndex !== activePlayerIndex) return
    const activeVid = playerIndex === 0 ? videoRef0.current : videoRef1.current
    if (!activeVid || !activeVid.duration || transitioningRef.current) return

    const timeLeft = activeVid.duration - activeVid.currentTime
    if (timeLeft <= 0.18 && timeLeft > 0) {
      const total = validTokensRef.current.length
      if (total <= 1 && !isLoopRef.current) return

      transitioningRef.current = true
      const nextIndex = activeIndexRef.current < total - 1 ? activeIndexRef.current + 1 : isLoopRef.current ? 0 : -1

      if (nextIndex !== -1) {
        const idlePlayerIndex = playerIndex === 0 ? 1 : 0
        const idleVid = idlePlayerIndex === 0 ? videoRef0.current : videoRef1.current
        if (idleVid) {
          idleVid.playbackRate = playbackSpeed
          idleVid.play().catch(() => {})
        }
        setActivePlayerIndex(idlePlayerIndex)
        setActiveValidIndex(nextIndex)
      } else {
        setIsPlaying(false)
      }
    }
  }

  // Fallback saat video benar-benar berakhir
  const handleVideoEnded = (playerIndex: number) => {
    if (playerIndex !== activePlayerIndex || transitioningRef.current) return

    const total = validTokensRef.current.length
    if (total === 0) return

    if (activeIndexRef.current < total - 1) {
      const idlePlayerIndex = playerIndex === 0 ? 1 : 0
      setActivePlayerIndex(idlePlayerIndex)
      setActiveValidIndex((prev) => prev + 1)
    } else {
      if (isLoopRef.current) {
        const idlePlayerIndex = playerIndex === 0 ? 1 : 0
        setActivePlayerIndex(idlePlayerIndex)
        setActiveValidIndex(0)
      } else {
        setIsPlaying(false)
      }
    }
  }

  // Lompati kata jika terjadi error pada video
  const handleSkipErrorWord = () => {
    setVideoError(null)
    handleVideoEnded(activePlayerIndex)
  }

  const [isListening, setIsListening] = useState<boolean>(false)

  async function handleListen() {
    try {
      setIsListening(true)
      const transcript = await listenOnce()
      if (transcript) {
        setInput(transcript)
        handleSubmit(transcript)
      }
    } catch (err) {
      console.error('STT gagal:', err)
    } finally {
      setIsListening(false)
    }
  }

  const togglePlayPause = () => {
    const activeVid = activePlayerIndex === 0 ? videoRef0.current : videoRef1.current
    if (!activeVid) return

    if (isPlaying) {
      activeVid.pause()
      setIsPlaying(false)
    } else {
      activeVid.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  const handleRestartSentence = () => {
    setActiveValidIndex(0)
    setIsPlaying(true)
    setVideoError(null)
    const activeVid = activePlayerIndex === 0 ? videoRef0.current : videoRef1.current
    if (activeVid) {
      activeVid.currentTime = 0
      activeVid.play().catch(() => {})
    }
  }

  const samplePrompts = [
    'Mengapa kamu belajar',
    'Terima kasih',
    'Rumah keluarga',
    'Pagi ini makan apa',
    'Saya mau cari teman',
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Header Info Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 card-dark p-4">
        <div>
          <h2 className="text-lg font-bold">Teks / Suara -&gt; Isyarat</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Ketik kata atau kalimat untuk menampilkan dan merangkai video peragaan isyarat secara langsung.
          </p>
        </div>

        <button
          onClick={onOpenDictionaryModal}
          className="flex items-center gap-1.5 rounded-xl bg-teal-500/20 px-3.5 py-2 text-xs font-semibold text-teal-300 border border-teal-500/30 hover:bg-teal-500/30 transition-all active:scale-95 shadow-xs"
        >
          Lihat 32 Label Kosakata
        </button>
      </div>

      {/* Input Box & Control Bar */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
            placeholder="Ketik kalimat (contoh: Mengapa kamu belajar, Terima kasih)..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit(input)}
          />
          <button
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 active:scale-95 transition-all"
            onClick={() => handleSubmit(input)}
          >
            Tampilkan Video Kalimat
          </button>
          {isSpeechRecognitionSupported() && (
            <button
              disabled={isListening}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border active:scale-95 ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md animate-pulse ring-2 ring-rose-400/40'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              onClick={handleListen}
              title="Bicara via Mikrofon"
            >
              <span className={`h-2 w-2 rounded-full ${isListening ? 'bg-white animate-ping' : 'bg-rose-500'}`} />
              <span>{isListening ? 'Mendengarkan...' : 'Suara (Mic)'}</span>
            </button>
          )}
        </div>

        {/* Banner Indikator Suara Aktif */}
        {isListening && (
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 border border-rose-200 shadow-xs animate-pulse">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
            </span>
            <span className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" />
              <span>Mikrofon Aktif! Silakan bicara kalimat Anda sekarang...</span>
            </span>
          </div>
        )}

        {/* Quick Sample Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="font-semibold text-slate-400">Contoh Kalimat:</span>
          {samplePrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setInput(prompt)
                handleSubmit(prompt)
              }}
              className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-600 hover:bg-teal-50 hover:text-teal-700 border border-slate-200 transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* PEMUTAR KALIMAT UTAMA */}
      {tokens.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Pemutar Kalimat Isyarat
              </h3>
              <p className="text-xs text-slate-500">
                Menampilkan {validTokens.length} video isyarat dari total {tokens.length} kata pada kalimat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Speed Selector */}
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value={0.75}>Kecepatan 0.75x</option>
                <option value={1.0}>Kecepatan 1.0x (Normal)</option>
                <option value={1.25}>Kecepatan 1.25x</option>
                <option value={1.5}>Kecepatan 1.5x</option>
              </select>

              {/* Loop Toggle */}
              <button
                onClick={() => setIsLoopSentence(!isLoopSentence)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                  isLoopSentence
                    ? 'bg-teal-50 text-teal-700 border-teal-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {isLoopSentence ? 'Loop Kalimat: Aktif' : 'Putar 1x'}
              </button>
            </div>
          </div>

          {/* Player Display & Subtitle Bar */}
          {validTokens.length > 0 && activeToken ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 shadow-xl flex items-center justify-center">
                {/* Player 0 */}
                <video
                  ref={videoRef0}
                  controlsList="nodownload"
                  muted
                  preload="auto"
                  playsInline
                  onTimeUpdate={() => handleTimeUpdate(0)}
                  onEnded={() => handleVideoEnded(0)}
                  onError={() => setVideoError(`Gagal memutar video kata "${activeToken.labelName ?? activeToken.originalWord}"`)}
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-in-out ${
                    activePlayerIndex === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                />

                {/* Player 1 */}
                <video
                  ref={videoRef1}
                  controlsList="nodownload"
                  muted
                  preload="auto"
                  playsInline
                  onTimeUpdate={() => handleTimeUpdate(1)}
                  onEnded={() => handleVideoEnded(1)}
                  onError={() => setVideoError(`Gagal memutar video kata "${activeToken.labelName ?? activeToken.originalWord}"`)}
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-in-out ${
                    activePlayerIndex === 1 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                />

                {/* Overlay Video Error Fallback */}
                {videoError && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center">
                    <p className="mt-2 text-sm font-bold text-rose-300">{videoError}</p>
                    <p className="mt-1 text-xs text-slate-400">File video tidak dapat dimuat atau format tidak didukung.</p>
                    <button
                      onClick={handleSkipErrorWord}
                      className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-500 active:scale-95 transition-all"
                    >
                      Lompati Kata Ini -&gt;
                    </button>
                  </div>
                )}

                {/* Subtitle Badge di Atas Video */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-xl bg-slate-950/80 px-3.5 py-1.5 text-xs font-bold text-white shadow-md backdrop-blur border border-slate-700">
                  <span className={`h-2 w-2 rounded-full ${isPlaying ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-teal-400">Kata #{activeValidIndex + 1}/{validTokens.length}:</span>
                  <span className="text-white capitalize">{activeToken.labelName ?? activeToken.originalWord}</span>
                </div>
              </div>

              {/* Tombol Kontrol Pemutar Utama */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRestartSentence}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all"
                >
                  Ulang dari Awal
                </button>

                <button
                  onClick={togglePlayPause}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md active:scale-95 transition-all ${
                    isPlaying ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isPlaying ? 'Jeda Kalimat' : 'Lanjutkan Kalimat'}
                </button>
              </div>

              {/* TIMELINE RANGKAIAN KALIMAT (Sentence Timeline Ribbon) */}
              <div className="w-full rounded-2xl bg-slate-50 p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="font-bold text-slate-700">Alur Kata Kalimat:</span>
                  <span className="text-slate-400 text-[11px]">Klik kata untuk memutar video kata tersebut</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {tokens.map((token, idx) => {
                    const isAvailable = Boolean(token.videoUrl)
                    const validIndex = validTokens.findIndex((v) => v === token)
                    const isActiveWord = validIndex === activeValidIndex && isAvailable

                    return (
                      <div key={`${token.originalWord}-${idx}`} className="flex items-center gap-1.5">
                        <button
                          disabled={!isAvailable}
                          onClick={() => {
                            if (validIndex !== -1) {
                              setActiveValidIndex(validIndex)
                              setIsPlaying(true)
                            }
                          }}
                          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all border ${
                            isActiveWord
                              ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-500/30 scale-105'
                              : isAvailable
                              ? 'bg-white text-slate-800 border-slate-200 hover:border-teal-400 hover:bg-teal-50'
                              : 'bg-slate-200/60 text-slate-400 border-transparent cursor-not-allowed'
                          }`}
                        >
                          <span className="capitalize">{token.labelName ?? token.originalWord}</span>
                        </button>

                        {idx < tokens.length - 1 && (
                          <span className="text-slate-300 text-xs font-bold">-&gt;</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-2xl border border-slate-200">
              <p className="mt-2 text-sm font-bold text-slate-700">
                Tidak ada kata dari kalimat ini yang terdaftar di dictionary video.
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Gunakan kosakata terdaftar seperti: <span className="font-semibold text-slate-600">Mengapa, Belajar, Saya, Rumah, Keluarga, Pagi, Makan, Terima kasih</span>, dll.
              </p>
            </div>
          )}

          {/* BREAKDOWN CARD PER KATA (Detail Rincian Kata) */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Rincian Video Per-Kata:
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tokens.map((token, i) => {
                const validIndex = validTokens.findIndex((v) => v === token)
                const isActive = validIndex === activeValidIndex && Boolean(token.videoUrl)

                return (
                  <div
                    key={`card-${token.originalWord}-${i}`}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-xs transition-all ${
                      isActive
                        ? 'border-teal-500 bg-teal-50 text-teal-900 font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate font-semibold">
                      <span className="truncate capitalize">{token.labelName ?? token.originalWord}</span>
                    </div>

                    {token.videoUrl && (
                      <button
                        onClick={() => {
                          if (validIndex !== -1) {
                            setActiveValidIndex(validIndex)
                            setIsPlaying(true)
                          }
                        }}
                        className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-800"
                      >
                        Putar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Featured Dictionary Grid (Informasi Label Yang Tersedia di Website) */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Ringkasan 32 Kosakata Isyarat Terdaftar
            </h3>
            <p className="text-xs text-slate-500">Klik label di bawah untuk memasukkan langsung ke pencarian video.</p>
          </div>
          <button
            onClick={onOpenDictionaryModal}
            className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline"
          >
            Lihat Detail Modal -&gt;
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SIGN_DICTIONARY_DATA.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setInput(item.label)
                handleSubmit(item.label)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 transition-all active:scale-95 shadow-2xs"
            >
              <span>{item.label}</span>
              <span className="text-[10px] text-slate-400 font-normal">({item.category})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

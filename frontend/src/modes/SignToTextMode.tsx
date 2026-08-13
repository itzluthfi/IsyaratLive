import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { CameraCapture } from '../components/CameraCapture'
import {
  getHandLandmarker,
  getPoseLandmarker,
  detectFrame,
  detectPoseFrame,
  drawHandAndPoseLandmarks,
  detectTwoHandGesture,
  type HandGesture,
} from '../components/LandmarkDetector'
import {
  GlossSequenceBuffer,
  extractRawWrists,
  landmarksToVector,
  landmarksTo164DVector,
  loadGlossModel,
  GLOSS_MODEL_VERSIONS,
  GLOSS_MODEL_INFO,
  LATEST_GLOSS_MODEL,
  type GlossModelVersion,
} from '../components/GlossClassifier'
import { speak } from '../components/SpeechOutput'
import { normalizeGloss, saveHistory, type ConversationMessage } from '../lib/api'
import { Play, Square } from 'lucide-react'
import { SIGN_DICTIONARY_DATA } from '../lib/signDictionary'

const GLOSS_AUTO_FLUSH_MS = 60000 // auto-flush 60 detik jika pengguna diam dan lupa gestur stop 🙅 dalam Mode Normal

interface SignToTextModeProps {
  onOpenDictionaryModal?: () => void
  onAddMessage: (message: ConversationMessage) => void
  /** Melaporkan status live (gloss yang sedang terkumpul & status mode degradasi) ke Room pemanggil, untuk ditampilkan di feed obrolan bersama. */
  onLiveStatusChange?: (status: { liveGloss: string[]; degraded: boolean }) => void
}

export interface SignToTextModeHandle {
  /** Matikan mode degradasi paksa (dipanggil dari tombol di ChatDisplay level Room). */
  disableForcedDegraded: () => void
}

/** Mode 1: kamera -> deteksi isyarat real-time -> LLM / Instan Per Kata -> Suara. */
export const SignToTextMode = forwardRef<SignToTextModeHandle, SignToTextModeProps>(function SignToTextMode(
  { onOpenDictionaryModal, onAddMessage, onLiveStatusChange },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [liveGloss, setLiveGloss] = useState<string[]>([])
  const [degraded, setDegraded] = useState(false)
  const [forcedDegraded, setForcedDegraded] = useState(false)
  useImperativeHandle(ref, () => ({
    disableForcedDegraded: () => setForcedDegraded(false),
  }))
  const [modelVer, setModelVer] = useState<GlossModelVersion>(LATEST_GLOSS_MODEL)
  const [modelReady, setModelReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastPrediction, setLastPrediction] = useState<{ label: string; confidence: number } | null>(null)
  const [handDetected, setHandDetected] = useState(false)

  // Status Gerakan (Motion Detection Per-Gerakan)
  const [motionInfo, setMotionInfo] = useState<{ isStill: boolean; energy: number }>({
    isStill: true,
    energy: 0,
  })

  // Status Perekaman / Deteksi Isyarat Aktif (Default TRUE: Langsung aktif menerjemahkan saat kamera & tangan terdeteksi)
  const [isRecording, setIsRecording] = useState(true)
  const [currentGesture, setCurrentGesture] = useState<HandGesture>('NONE')
  const [gestureToast, setGestureToast] = useState<string | null>(null)

  // Ref untuk closure di dalam loop requestAnimationFrame
  const forcedDegradedRef = useRef(forcedDegraded)
  const isRecordingRef = useRef(isRecording)
  const modelVerRef = useRef(modelVer)
  const activeModelRef = useRef<tf.LayersModel | null>(null)
  const collectedGlossRef = useRef<string[]>([])
  const recordingStartTimeRef = useRef<number>(0)
  const lastRecognizedWordRef = useRef<{ word: string; time: number }>({ word: '', time: 0 })

  useEffect(() => {
    forcedDegradedRef.current = forcedDegraded
  }, [forcedDegraded])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    onLiveStatusChange?.({ liveGloss, degraded: degraded || forcedDegraded })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGloss, degraded, forcedDegraded])

  useEffect(() => {
    modelVerRef.current = modelVer
    loadGlossModel(modelVer)
      .then((m) => {
        activeModelRef.current = m
      })
      .catch((err) => {
        console.warn('Gagal memuat model:', err)
      })

    triggerToast(`Beralih ke ${GLOSS_MODEL_INFO[modelVer].label} — ${GLOSS_MODEL_INFO[modelVer].description}`)
  }, [modelVer])

  useEffect(() => {
    let cancelled = false
    let rafId: number

    const buffer = new GlossSequenceBuffer()
    let openPalmFrames = 0
    let closedFistFrames = 0

    async function run() {
      try {
        const [handLandmarker, poseLandmarker, model] = await Promise.all([
          getHandLandmarker(),
          getPoseLandmarker(),
          loadGlossModel(modelVerRef.current),
        ])
        if (cancelled) return
        activeModelRef.current = model
        setModelReady(true)

        let frameCounter = 0
        let cachedPoseResult: any = null

        async function loop() {
          if (cancelled) return
          try {
            const video = videoRef.current
            const canvas = canvasRef.current

            if (video && video.readyState >= 2) {
              const timestamp = performance.now()
              const handResult = await detectFrame(handLandmarker, video, timestamp)

              frameCounter++
              let poseResult = cachedPoseResult
              if (frameCounter % 3 === 0 || !cachedPoseResult) {
                cachedPoseResult = await detectPoseFrame(poseLandmarker, video, timestamp).catch(() => null)
                poseResult = cachedPoseResult
              }

              const hasHands = Boolean(handResult.landmarks && handResult.landmarks.length > 0)
              setHandDetected(hasHands)

              // Gambar tracking AR skeleton lengkap (Wajah, Kepala, Lengan, Bahu & Tangan)
              if (canvas && video.videoWidth && video.videoHeight) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                  canvas.width = video.videoWidth
                  canvas.height = video.videoHeight
                }
                const ctx = canvas.getContext('2d')
                if (ctx) {
                  drawHandAndPoseLandmarks(ctx, handResult, poseResult, canvas.width, canvas.height)
                }
              }

              // 1. Deteksi Gestur MULAI (✋ Telapak Tangan Terbuka) / STOP (🙅 Tangan Bersilang)
              if (hasHands && handResult.landmarks) {
                const gesture = detectTwoHandGesture(handResult.landmarks)
                setCurrentGesture(gesture)

                if (gesture === 'OPEN_PALM') {
                  openPalmFrames++
                  closedFistFrames = 0
                  if (openPalmFrames >= 4 && !isRecordingRef.current) {
                    recordingStartTimeRef.current = performance.now()
                    setIsRecording(true)
                    triggerToast('🖐️🖐️ Dua Telapak Tangan Terbuka! Perekaman Kalimat Dimulai.')
                    openPalmFrames = 0
                  }
                } else if (gesture === 'CROSSED_HANDS') {
                  closedFistFrames++
                  openPalmFrames = 0
                  if (closedFistFrames >= 5) {
                    setIsRecording(false)
                    recordingStartTimeRef.current = 0
                    buffer.clear()
                    triggerToast('🙅 Tangan Bersilang! Memproses Kalimat...')
                    closedFistFrames = 0
                    if (collectedGlossRef.current.length > 0 && !forcedDegradedRef.current) {
                      const glossToFlush = [...collectedGlossRef.current]
                      collectedGlossRef.current = []
                      setLiveGloss([])
                      void flushGloss(glossToFlush)
                    }
                  }
                } else {
                  openPalmFrames = 0
                  closedFistFrames = 0
                }
              } else {
                setCurrentGesture('NONE')
                openPalmFrames = 0
                closedFistFrames = 0
              }

              // 2. Klasifikasi Isyarat Real-Time (HANYA AKTIF SAAT RECORDING / SAKELAR AKTIF)
              if (hasHands && activeModelRef.current && isRecordingRef.current) {
                const activeModel = activeModelRef.current
                const expectedDim = activeModel.inputs[0]?.shape?.[2] ?? 126
                const isV7 = expectedDim === 164
                const rawWrists = extractRawWrists(handResult)

                if (isV7) {
                  const res7 = landmarksTo164DVector(handResult)
                  buffer.push(res7.vector, rawWrists)
                } else {
                  // Model v1 / v2 (126D, landmark tangan saja)
                  buffer.push(landmarksToVector(handResult), rawWrists)
                }

                const isStill = buffer.getIsStill()
                const energy = buffer.getMotionEnergy()
                setMotionInfo({ isStill, energy })

                // Jalankan inferensi TFJS via activeModelRef
                const prediction = await buffer.classify(activeModel, forcedDegradedRef.current)

                if (prediction) {
                  const word = prediction.label
                  const lowerWord = word.toLowerCase()
                  const now = performance.now()

                  if (forcedDegradedRef.current) {
                    // MODE DEGRADASI (PER-KATA): SUARAKAN & CHAT INSTAN PER GERAKAN
                    const isDuplicate = lastRecognizedWordRef.current.word.toLowerCase() === lowerWord
                    if (!isDuplicate) {
                      lastRecognizedWordRef.current = { word, time: now }
                      setLastPrediction(prediction)
                      triggerToast(`✨ Isyarat Terdeteksi: "${word}" (${(prediction.confidence * 100).toFixed(0)}%)`)
                      setLiveGloss([word])

                      const message: ConversationMessage = {
                        id: Date.now(),
                        gloss: [word],
                        text: word,
                        createdAt: new Date().toISOString(),
                        direction: 'sign-to-text',
                      }
                      onAddMessage(message)
                      speak(word)
                    }
                  } else {
                    // MODE NORMAL (KALIMAT): Kumpulkan kata unik (bebas ganda dalam 1 sesi kalimat). Kata yang sudah muncul tidak boleh memicu notifikasi / suara sampai Selesai & Kirim.
                    const alreadyInSentence = collectedGlossRef.current.some(
                      (w) => w.toLowerCase() === lowerWord
                    )
                    if (!alreadyInSentence) {
                      lastRecognizedWordRef.current = { word, time: now }
                      collectedGlossRef.current.push(word)
                      setLiveGloss([...collectedGlossRef.current])
                      setLastPrediction(prediction)
                      triggerToast(`✨ Isyarat Terdeteksi: "${word}" (${(prediction.confidence * 100).toFixed(0)}%)`)
                      speak(word)
                    }
                  }
                }

                // Auto-flush dalam Mode Normal HANYA jika pengguna diam (isStill) setelah 60s
                if (
                  !forcedDegradedRef.current &&
                  isStill &&
                  recordingStartTimeRef.current > 0 &&
                  performance.now() - recordingStartTimeRef.current > GLOSS_AUTO_FLUSH_MS &&
                  collectedGlossRef.current.length > 0
                ) {
                  const glossToFlush = [...collectedGlossRef.current]
                  collectedGlossRef.current = []
                  recordingStartTimeRef.current = 0
                  setLiveGloss([])
                  setIsRecording(false)
                  triggerToast('⏰ Batas Waktu Deteksi Tercapai! Memproses Kalimat...')
                  void flushGloss(glossToFlush)
                }
              } else {
                if (!isRecordingRef.current) {
                  buffer.clear()
                  setMotionInfo({ isStill: true, energy: 0 })
                }
              }
            }
          } catch (loopErr) {
            console.warn('Error transient pada loop kamera (diabaikan demi kontinuitas):', loopErr)
          } finally {
            if (!cancelled) {
              rafId = requestAnimationFrame(loop)
            }
          }
        }

        loop()
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Gagal memuat model deteksi isyarat')
      }
    }

    run()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [])

  function triggerToast(msg: string) {
    setGestureToast(msg)
    setTimeout(() => {
      setGestureToast(null)
    }, 2800)
  }

  async function flushGloss(gloss: string[]) {
    if (forcedDegradedRef.current) {
      setDegraded(true)
      const rawText = gloss.join(' ')
      const message: ConversationMessage = {
        id: Date.now(),
        gloss,
        text: rawText,
        createdAt: new Date().toISOString(),
        direction: 'sign-to-text',
      }
      onAddMessage(message)
      speak(rawText)
      return
    }

    try {
      const { text } = await normalizeGloss(gloss)
      setDegraded(false)
      const message: ConversationMessage = {
        id: Date.now(),
        gloss,
        text,
        createdAt: new Date().toISOString(),
        direction: 'sign-to-text',
      }
      onAddMessage(message)
      speak(text)
      void saveHistory(gloss, text)
    } catch {
      setDegraded(true)
      const rawText = gloss.join(' ')
      const message: ConversationMessage = {
        id: Date.now(),
        gloss,
        text: rawText,
        createdAt: new Date().toISOString(),
        direction: 'sign-to-text',
      }
      onAddMessage(message)
      speak(rawText)
    }
  }

  const handleManualStart = () => {
    recordingStartTimeRef.current = performance.now()
    setIsRecording(true)
    triggerToast('Deteksi Isyarat Dimulai!')
  }

  const handleManualStop = () => {
    recordingStartTimeRef.current = 0
    setIsRecording(false)
    triggerToast('Deteksi Dihentikan & Memproses...')
    if (collectedGlossRef.current.length > 0 && !forcedDegradedRef.current) {
      const glossToFlush = [...collectedGlossRef.current]
      collectedGlossRef.current = []
      setLiveGloss([])
      void flushGloss(glossToFlush)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {/* Control Panel Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 card p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Pemilih Versi Model AI — Dropdown Select Compact */}
          <div className="flex items-center gap-2">
            <label htmlFor="model-select" className="text-xs font-semibold text-slate-600">
              Versi AI:
            </label>
            <select
              id="model-select"
              value={modelVer}
              onChange={(e) => setModelVer(e.target.value as GlossModelVersion)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-xs focus:border-slate-800 focus:outline-none"
            >
              {GLOSS_MODEL_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {GLOSS_MODEL_INFO[v].label} {v === LATEST_GLOSS_MODEL ? '(Terbaik)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Status Mode */}
          <span className={forcedDegraded ? 'badge-warning' : 'badge-active'}>
            {forcedDegraded ? 'Mode Kata Langsung' : 'Mode Kalimat Otomatis'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sakelar Mode Kalimat vs Kata Langsung */}
          <button
            onClick={() => setForcedDegraded(!forcedDegraded)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {forcedDegraded ? 'Ubah ke Mode Kalimat' : 'Ubah ke Kata Langsung'}
          </button>

          {/* Tombol Kontrol Perekaman Isyarat */}
          {!isRecording ? (
            <button onClick={handleManualStart} className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" />
              <span>Mulai Mendeteksi</span>
            </button>
          ) : (
            <button onClick={handleManualStop} className="btn-danger text-xs px-4 py-1.5 flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5" />
              <span>Selesai & Kirim</span>
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification Gestur */}
      {gestureToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg border border-slate-700">
          {gestureToast}
        </div>
      )}

      {/* Panduan Gestur Pemicu & Deteksi Per-Gerakan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-3 text-xs text-slate-300 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <div>
            <span className="font-bold text-white">MULAI:</span> Angkat Kedua Telapak Tangan Terbuka
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div>
            <span className="font-bold text-white">SELESAI:</span> Silangkan Tangan di Depan
          </div>
        </div>
      </div>

      <div>
        <CameraCapture ref={videoRef} canvasRef={canvasRef} />

          {/* Live Motion Energy & Detection Monitor (Fitur Per-Gerakan) */}
          <div className="mt-2.5 flex flex-col gap-2 rounded-2xl bg-slate-950 p-3 text-xs text-white shadow-md border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                <span className="font-medium text-slate-300">
                  {handDetected ? 'Tangan Terlihat' : 'Tangan Tidak Terlihat'}
                </span>

                {currentGesture === 'OPEN_PALM' && (
                  <span className="rounded bg-teal-900/80 px-2 py-0.5 font-bold text-teal-300 border border-teal-700">
                    DUA TELAPAK TANGAN TERBUKA
                  </span>
                )}
                {currentGesture === 'CROSSED_HANDS' && (
                  <span className="rounded bg-rose-900/80 px-2 py-0.5 font-bold text-rose-300 border border-rose-700">
                    TANGAN BERSILANG (SELESAI)
                  </span>
                )}
              </div>

              {/* Status Per Gerakan (Motion Active vs Still/Diam) */}
              {isRecording && handDetected && (
                <div className="flex items-center gap-1.5">
                  {!motionInfo.isStill ? (
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-500/30 animate-pulse">
                      GERAKAN AKTIF
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 border border-amber-500/30">
                      DIAM (Menunggu Gerakan)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Visual Motion Gauge (Pengukur Kecepatan Gerakan Landmark) */}
            {isRecording && handDetected && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 min-w-[70px]">Intensitas Gerak:</span>
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${
                      !motionInfo.isStill ? 'bg-teal-500' : 'bg-slate-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, motionInfo.energy * 2500))}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 min-w-[40px] text-right font-mono">
                  {(motionInfo.energy * 100).toFixed(1)}
                </span>
              </div>
            )}

            {/* AI Last Prediction Display */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">Hasil Isyarat Terakhir:</span>
              {lastPrediction ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-teal-300">{lastPrediction.label}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 border border-slate-700">
                    {Math.round(lastPrediction.confidence * 100)}%
                  </span>
                </div>
              ) : (
                <span className="text-slate-500 italic">
                  {isRecording ? 'Lakukan satu gerakan isyarat...' : 'Mulai deteksi untuk mencoba'}
                </span>
              )}
            </div>
          </div>

          {loadError && <p className="mt-2 text-xs font-semibold text-rose-500">Gagal memuat model: {loadError}</p>}
          {!modelReady && !loadError && (
            <p className="mt-2 text-xs text-slate-500">Memuat model deteksi MediaPipe & TFJS…</p>
          )}

          {/* Quick Label Chips Reference */}
          <div className="mt-3 rounded-2xl bg-white p-3.5 shadow-xs border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">32 Kosakata Isyarat Terdaftar:</span>
              <button onClick={onOpenDictionaryModal} className="text-[11px] font-semibold text-teal-600 hover:underline">
                Lihat Semua (32) -&gt;
              </button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {SIGN_DICTIONARY_DATA.slice(0, 16).map((item) => (
                <span
                  key={item.id}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200"
                >
                  {item.label}
                </span>
              ))}
              <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 border border-teal-200">
                +16 Lainnya
              </span>
            </div>
          </div>
      </div>
    </div>
  )
})

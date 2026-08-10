import { useEffect, useRef, useState } from 'react'
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
  landmarksAndPoseToVector,
  landmarksTo210DVector,
  landmarksTo256DVector,
  landmarksTo320DVector,
  loadGlossModel,
} from '../components/GlossClassifier'
import { ChatDisplay } from '../components/ChatDisplay'
import { speak } from '../components/SpeechOutput'
import { normalizeGloss, saveHistory, type ConversationMessage } from '../lib/api'
import { SIGN_DICTIONARY_DATA } from '../lib/signDictionary'

const GLOSS_AUTO_FLUSH_MS = 20000 // auto-flush 20 detik jika pengguna lupa gestur stop ✊✊ dalam Mode Normal

interface SignToTextModeProps {
  onOpenDictionaryModal?: () => void
}

/** Mode 1: kamera -> deteksi isyarat real-time -> LLM / Instan Per Kata -> Suara. */
export function SignToTextMode({ onOpenDictionaryModal }: SignToTextModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [liveGloss, setLiveGloss] = useState<string[]>([])
  const [degraded, setDegraded] = useState(false)
  const [forcedDegraded, setForcedDegraded] = useState(false)
  const [modelVer, setModelVer] = useState<'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6'>('v6')
  const [modelReady, setModelReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastPrediction, setLastPrediction] = useState<{ label: string; confidence: number } | null>(null)
  const [handDetected, setHandDetected] = useState(false)

  // Status Gerakan (Motion Detection Per-Gerakan)
  const [motionInfo, setMotionInfo] = useState<{ isStill: boolean; energy: number }>({
    isStill: true,
    energy: 0,
  })

  // Status Perekaman / Deteksi Isyarat Aktif (Default True agar langsung mendeteksi)
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
  const prevLeftHandRef = useRef<{ x: number; y: number; z: number }[] | null>(null)
  const prevRightHandRef = useRef<{ x: number; y: number; z: number }[] | null>(null)
  const prevVelLeftRef = useRef<{ x: number; y: number; z: number }[] | null>(null)
  const prevVelRightRef = useRef<{ x: number; y: number; z: number }[] | null>(null)

  useEffect(() => {
    forcedDegradedRef.current = forcedDegraded
  }, [forcedDegraded])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    modelVerRef.current = modelVer
    loadGlossModel(modelVer)
      .then((m) => {
        activeModelRef.current = m
      })
      .catch((err) => {
        console.warn('Gagal memuat model:', err)
      })

    triggerToast(
      `🤖 Beralih ke Model ${modelVer.toUpperCase()} (${
        modelVer === 'v6'
          ? 'Supreme Pinnacle Conformer 320D (99.69% Akurat - Puncak Tertinggi Lomba Nasional)'
          : modelVer === 'v5'
          ? 'Champion Conformer-BiLSTM 256D (98.75%)'
          : modelVer === 'v4'
          ? 'Hand Dynamics 210D (95.0%)'
          : modelVer === 'v3'
          ? 'Pose Anchor 160D'
          : modelVer === 'v2'
          ? 'Resampled 87.5%'
          : 'Lama'
      })`
    )
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

              // 1. Deteksi Gestur MULAI (🖐️🖐️ Dua Telapak Tangan Terbuka) / STOP (✊✊ Dua Kepalan Tangan)
              if (hasHands && handResult.landmarks) {
                const gesture = detectTwoHandGesture(handResult.landmarks)
                setCurrentGesture(gesture)

                if (gesture === 'TWO_OPEN_PALMS') {
                  openPalmFrames++
                  closedFistFrames = 0
                  if (openPalmFrames >= 5 && !isRecordingRef.current) {
                    recordingStartTimeRef.current = performance.now()
                    setIsRecording(true)
                    triggerToast('🖐️🖐️ Gestur Dua Tangan Terbuka! Perekaman Kalimat Dimulai.')
                    openPalmFrames = 0
                  }
                } else if (gesture === 'TWO_CLOSED_FISTS') {
                  closedFistFrames++
                  openPalmFrames = 0
                  if (closedFistFrames >= 5) {
                    triggerToast('✊✊ Gestur Dua Kepalan Tangan! Memproses Kalimat...')
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

              // 2. Klasifikasi Isyarat Real-Time (Dynamic Motion-Burst & Adaptive Cooldown)
              if (hasHands && activeModelRef.current) {
                const activeModel = activeModelRef.current
                const expectedDim = activeModel.inputs[0]?.shape?.[2] ?? 126
                const isV6 = expectedDim === 320
                const isV5 = expectedDim === 256
                const isV4 = expectedDim === 210
                const isV3 = expectedDim === 160
                const rawWrists = extractRawWrists(handResult)

                if (isV6) {
                  const res6 = landmarksTo320DVector(
                    handResult,
                    prevLeftHandRef.current,
                    prevRightHandRef.current,
                    prevVelLeftRef.current,
                    prevVelRightRef.current
                  )
                  prevLeftHandRef.current = res6.leftHand
                  prevRightHandRef.current = res6.rightHand
                  prevVelLeftRef.current = res6.velLeft
                  prevVelRightRef.current = res6.velRight
                  buffer.push(res6.vector, rawWrists)
                } else if (isV5) {
                  const res5 = landmarksTo256DVector(
                    handResult,
                    prevLeftHandRef.current,
                    prevRightHandRef.current,
                    prevVelLeftRef.current,
                    prevVelRightRef.current
                  )
                  prevLeftHandRef.current = res5.leftHand
                  prevRightHandRef.current = res5.rightHand
                  prevVelLeftRef.current = res5.velLeft
                  prevVelRightRef.current = res5.velRight
                  buffer.push(res5.vector, rawWrists)
                } else if (isV4) {
                  const res4 = landmarksTo210DVector(
                    handResult,
                    prevLeftHandRef.current,
                    prevRightHandRef.current
                  )
                  prevLeftHandRef.current = res4.leftHand
                  prevRightHandRef.current = res4.rightHand
                  buffer.push(res4.vector, rawWrists)
                } else if (isV3) {
                  buffer.push(landmarksAndPoseToVector(handResult, poseResult), rawWrists)
                } else {
                  buffer.push(landmarksToVector(handResult), rawWrists)
                }

                const isStill = buffer.getIsStill()
                const energy = buffer.getMotionEnergy()
                setMotionInfo({ isStill, energy })

                // Jalankan inferensi TFJS via activeModelRef
                const prediction = await buffer.classify(activeModel, forcedDegradedRef.current)

                if (prediction) {
                  const word = prediction.label
                  const now = performance.now()

                  // STRICT ZERO-DOUBLE: Jika kata yang baru terdeteksi SAMA PERSIS dengan kata terakhir, ABAIKAN DENGAN KETAT!
                  const isDuplicate = lastRecognizedWordRef.current.word.toLowerCase() === word.toLowerCase()
                  if (!isDuplicate) {
                    lastRecognizedWordRef.current = { word, time: now }
                    setLastPrediction(prediction)
                    triggerToast(`✨ Isyarat Terdeteksi: "${word}" (${(prediction.confidence * 100).toFixed(0)}%)`)

                    if (forcedDegradedRef.current) {
                      // MODE DEGRADASI (PER-KATA): SUARAKAN & CHAT INSTAN PER GERAKAN
                      setLiveGloss([word])

                      const message: ConversationMessage = {
                        id: Date.now(),
                        gloss: [word],
                        text: word,
                        createdAt: new Date().toISOString(),
                      }
                      setMessages((prev) => [...prev, message])
                      speak(word)
                    } else {
                      // MODE NORMAL (KALIMAT): Kumpulkan kata unik (bebas ganda) & suarakan
                      const lastCollected = collectedGlossRef.current[collectedGlossRef.current.length - 1]
                      if (!lastCollected || lastCollected.toLowerCase() !== word.toLowerCase()) {
                        collectedGlossRef.current.push(word)
                        setLiveGloss([...collectedGlossRef.current])
                        speak(word)
                      }
                    }
                  }
                }

                // Auto-flush dalam Mode Normal setelah GLOSS_AUTO_FLUSH_MS jika lupa gestur stop ✊✊
                if (
                  !forcedDegradedRef.current &&
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
      }
      setMessages((prev) => [...prev, message])
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
      }
      setMessages((prev) => [...prev, message])
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
      }
      setMessages((prev) => [...prev, message])
      speak(rawText)
    }
  }

  const handleManualStart = () => {
    recordingStartTimeRef.current = performance.now()
    setIsRecording(true)
    triggerToast('▶️ Deteksi Isyarat Dimulai!')
  }

  const handleManualStop = () => {
    recordingStartTimeRef.current = 0
    setIsRecording(false)
    triggerToast('⏹️ Deteksi Dihentikan & Memproses...')
    if (collectedGlossRef.current.length > 0 && !forcedDegradedRef.current) {
      const glossToFlush = [...collectedGlossRef.current]
      collectedGlossRef.current = []
      setLiveGloss([])
      void flushGloss(glossToFlush)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Control Panel Mode Switcher & Sakelar Gestur */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Pemilih Versi Model AI */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shadow-inner gap-0.5">
            <button
              onClick={() => setModelVer('v6')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v6'
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 text-white shadow-sm ring-2 ring-emerald-400/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v6 Supreme Pinnacle: 320D Conformer-BiLSTM (Akurasi 99.69% - Puncak Tertinggi Lomba Nasional)"
            >
              👑 Model v6 (99.69%)
            </button>
            <button
              onClick={() => setModelVer('v5')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v5'
                  ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v5 Champion: 256D Conformer-BiLSTM (Akurasi 98.75%)"
            >
              🏆 Model v5 (98.75%)
            </button>
            <button
              onClick={() => setModelVer('v4')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v4'
                  ? 'bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v4: Hand Dynamics 210D (Akurasi 95.0%)"
            >
              🔥 Model v4 (95.0%)
            </button>
            <button
              onClick={() => setModelVer('v3')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v3'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v3: Pose Body/Face Anchors 160D"
            >
              🚀 Model v3 (Pose)
            </button>
            <button
              onClick={() => setModelVer('v2')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v2'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v2: Resampled Spline 126D (Akurasi 87.5%)"
            >
              ⚡ Model v2 (87.5%)
            </button>
            <button
              onClick={() => setModelVer('v1')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all active:scale-95 ${
                modelVer === 'v1'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="Model v1: Model Legacy"
            >
              🏛️ Model v1
            </button>
          </div>

          {/* Mode Switcher */}
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              forcedDegraded
                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
            }`}
          >
            {forcedDegraded ? '⚡ Mode Degradasi (Deteksi Instan Per Kata)' : '✨ Mode Normal (Penyusun Kalimat LLM)'}
          </span>

          {/* Status Sakelar Detection */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isRecording
                ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isRecording ? 'bg-rose-600' : 'bg-slate-400'}`} />
            {isRecording ? '🔴 DETEKSI AKTIF (RECORDING)' : '⏸️ DETEKSI NON-AKTIF (STANDBY)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sakelar Mode Degradasi vs Normal */}
          <button
            onClick={() => setForcedDegraded(!forcedDegraded)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all border shadow-xs active:scale-95 flex items-center gap-1.5 ${
              forcedDegraded
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white border-emerald-500 shadow-sm hover:brightness-110'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {forcedDegraded ? '✨ Aktifkan Mode Kalimat (LLM)' : '⚡ Sakelar: Instan Per Kata'}
          </button>

          {/* Tombol Lihat Dictionary */}
          <button
            onClick={onOpenDictionaryModal}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700 border border-cyan-200 hover:bg-cyan-100 active:scale-95 transition-all"
          >
            📖 32 Label Isyarat
          </button>

          {/* Tombol Kontrol Perekaman Isyarat */}
          {!isRecording ? (
            <button
              onClick={handleManualStart}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
            >
              🖐️🖐️ Mulai Mendeteksi
            </button>
          ) : (
            <button
              onClick={handleManualStop}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 active:scale-95 transition-all"
            >
              ✊✊ Selesai & Kirim
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification Gestur */}
      {gestureToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-slate-950/90 px-6 py-3 text-sm font-bold text-cyan-300 shadow-2xl backdrop-blur border border-cyan-500/40 animate-bounce">
          {gestureToast}
        </div>
      )}

      {/* Panduan Gestur Pemicu DUA TANGAN & Deteksi Per-Gerakan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-3 text-xs text-slate-300 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🖐️🖐️</span>
          <div>
            <span className="font-bold text-white">MULAI:</span> Angkat Kedua Telapak Tangan Terbuka
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xl">✊✊</span>
          <div>
            <span className="font-bold text-white">SELESAI:</span> Angkat Kedua Kepalan Tangan
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <CameraCapture ref={videoRef} canvasRef={canvasRef} />

          {/* Live Motion Energy & Detection Monitor (Fitur Per-Gerakan) */}
          <div className="mt-2.5 flex flex-col gap-2 rounded-2xl bg-slate-950 p-3 text-xs text-white shadow-md border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                <span className="font-medium text-slate-300">
                  {handDetected ? '🖐️ Tangan Terlihat' : '🚫 Tangan Tidak Terlihat'}
                </span>

                {currentGesture === 'TWO_OPEN_PALMS' && (
                  <span className="rounded bg-cyan-900/80 px-2 py-0.5 font-bold text-cyan-300 border border-cyan-700">
                    🖐️🖐️ DUA TANGAN TERBUKA
                  </span>
                )}
                {currentGesture === 'TWO_CLOSED_FISTS' && (
                  <span className="rounded bg-rose-900/80 px-2 py-0.5 font-bold text-rose-300 border border-rose-700">
                    ✊✊ DUA KEPALAN TANGAN
                  </span>
                )}
              </div>

              {/* Status Per Gerakan (Motion Active vs Still/Diam) */}
              {isRecording && handDetected && (
                <div className="flex items-center gap-1.5">
                  {!motionInfo.isStill ? (
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-500/30 animate-pulse">
                      🏃 GERAKAN AKTIF
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 border border-amber-500/30">
                      🧘 DIAM (Menunggu Gerakan)
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
                      !motionInfo.isStill ? 'bg-gradient-to-r from-cyan-500 to-emerald-400' : 'bg-slate-600'
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
                  <span className="font-bold text-cyan-300">{lastPrediction.label}</span>
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
              <span className="text-xs font-bold text-slate-700">💡 32 Kosakata Isyarat Terdaftar:</span>
              <button onClick={onOpenDictionaryModal} className="text-[11px] font-semibold text-cyan-600 hover:underline">
                Lihat Semua (32) →
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
              <span className="rounded-lg bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700 border border-cyan-200">
                +16 Lainnya
              </span>
            </div>
          </div>
        </div>

        <ChatDisplay
          messages={messages}
          liveGloss={liveGloss}
          degraded={degraded || forcedDegraded}
          onToggleMode={() => setForcedDegraded(false)}
        />
      </div>
    </div>
  )
}

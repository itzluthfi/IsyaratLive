import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type * as tf from '@tensorflow/tfjs'
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
import { normalizeGloss, saveHistory } from '../lib/api'
import { SIGN_DICTIONARY_DATA } from '../lib/signDictionary'

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const GLOSS_AUTO_FLUSH_MS = 60000 // auto-flush 60 detik jika pengguna diam

interface RemoteChatMessage {
  id: number
  text: string
  from: 'me' | 'peer'
  createdAt: string
}

type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

interface RoomRemoteProps {
  onOpenDictionaryModal?: () => void
}

/**
 * Room Remote — dua perangkat, dua lokasi berbeda, terhubung lewat WebRTC
 * (video/audio peer-to-peer, gratis, bawaan browser) dengan signaling
 * via Socket.io ke backend. Deteksi isyarat & logika AR landmark skeleton
 * memakai pipeline SAMA PERSIS dengan Room Lokal (SignToTextMode).
 */
export function RoomRemote({ onOpenDictionaryModal }: RoomRemoteProps) {
  const [roomCode, setRoomCode] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [messages, setMessages] = useState<RemoteChatMessage[]>([])
  const [textInput, setTextInput] = useState('')
  const [detectionOn, setDetectionOn] = useState(true)

  // Status Mode Deteksi Isyarat (Sama Persis dengan Room Lokal / SignToTextMode)
  const [modelVer, setModelVer] = useState<GlossModelVersion>(LATEST_GLOSS_MODEL)
  const [modelReady, setModelReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [handDetected, setHandDetected] = useState(false)
  const [lastPrediction, setLastPrediction] = useState<{ label: string; confidence: number } | null>(null)
  const [liveGloss, setLiveGloss] = useState<string[]>([])
  const [forcedDegraded, setForcedDegraded] = useState(false)
  const [isRecording, setIsRecording] = useState(true)
  const [currentGesture, setCurrentGesture] = useState<HandGesture>('NONE')
  const [gestureToast, setGestureToast] = useState<string | null>(null)
  const [motionInfo, setMotionInfo] = useState<{ isStill: boolean; energy: number }>({
    isStill: true,
    energy: 0,
  })

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const isInitiatorRef = useRef(false)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Refs untuk closure loop requestAnimationFrame
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
    return () => {
      cleanupCall()
      socketRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    modelVerRef.current = modelVer
    loadGlossModel(modelVer)
      .then((m) => {
        activeModelRef.current = m
        setModelReady(true)
      })
      .catch((err) => {
        console.warn('Gagal memuat model di Room Remote:', err)
      })

    triggerToast(`Beralih ke ${GLOSS_MODEL_INFO[modelVer].label} — ${GLOSS_MODEL_INFO[modelVer].description}`)
  }, [modelVer])

  function triggerToast(msg: string) {
    setGestureToast(msg)
    setTimeout(() => {
      setGestureToast(null)
    }, 2800)
  }

  function cleanupCall() {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
  }

  function addMessage(text: string, from: 'me' | 'peer') {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), text, from, createdAt: new Date().toISOString() }])
  }

  async function setupPeerConnection(socket: Socket, code: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { code, data: { type: 'candidate', candidate: event.candidate.toJSON() } satisfies SignalPayload })
      }
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected')
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setErrorMsg('Koneksi dengan lawan bicara terputus.')
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    return pc
  }

  async function connectSocket(): Promise<Socket> {
    if (socketRef.current) return socketRef.current
    const socket = io({ path: '/socket.io' })
    socketRef.current = socket
    return new Promise((resolve) => {
      socket.on('connect', () => resolve(socket))
    })
  }

  async function handleCreateRoom() {
    setErrorMsg(null)
    const code = randomRoomCode()
    await joinRoom(code)
  }

  async function handleJoinRoom() {
    if (!joinInput.trim()) return
    setErrorMsg(null)
    await joinRoom(joinInput.trim().toUpperCase())
  }

  async function joinRoom(code: string) {
    setStatus('connecting')
    setRoomCode(code)
    try {
      const socket = await connectSocket()
      const pc = await setupPeerConnection(socket, code)

      socket.on('room:full', () => {
        setErrorMsg('Room ini sudah berisi 2 orang. Coba buat room baru.')
        setStatus('error')
      })

      socket.on('room:joined', ({ isInitiator }: { code: string; isInitiator: boolean }) => {
        isInitiatorRef.current = isInitiator
        setStatus(isInitiator ? 'waiting' : 'connecting')
      })

      socket.on('room:peer-joined', async () => {
        setStatus('connecting')
        if (isInitiatorRef.current) {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('signal', { code, data: { type: 'offer', sdp: offer } satisfies SignalPayload })
        }
      })

      socket.on('room:peer-left', () => {
        setErrorMsg('Lawan bicara meninggalkan room.')
        setStatus('waiting')
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
      })

      socket.on('signal', async (data: SignalPayload) => {
        if (data.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('signal', { code, data: { type: 'answer', sdp: answer } satisfies SignalPayload })
        } else if (data.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        } else if (data.type === 'candidate') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch (err) {
            console.warn('Gagal menambah ICE candidate:', err)
          }
        }
      })

      socket.on('chat:message', (message: { text: string }) => {
        addMessage(message.text, 'peer')
        speak(message.text)
      })

      socket.emit('room:join', code)
    } catch (err) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka kamera/mikrofon atau menyambung ke room.')
      setStatus('error')
    }
  }

  function handleLeaveRoom() {
    cleanupCall()
    socketRef.current?.disconnect()
    socketRef.current = null
    setStatus('idle')
    setRoomCode('')
    setMessages([])
    setLiveGloss([])
    collectedGlossRef.current = []
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
  }

  function sendText() {
    if (!textInput.trim() || !socketRef.current || !roomCode) return
    const text = textInput.trim()
    addMessage(text, 'me')
    socketRef.current.emit('chat:message', { code: roomCode, message: { text } })
    speak(text)
    setTextInput('')
  }

  async function flushGloss(gloss: string[]) {
    if (forcedDegradedRef.current) {
      const rawText = gloss.join(' ')
      addMessage(rawText, 'me')
      socketRef.current?.emit('chat:message', { code: roomCode, message: { text: rawText } })
      speak(rawText)
      return
    }

    try {
      const { text } = await normalizeGloss(gloss)
      addMessage(text, 'me')
      socketRef.current?.emit('chat:message', { code: roomCode, message: { text } })
      speak(text)
      void saveHistory(gloss, text)
    } catch {
      const rawText = gloss.join(' ')
      addMessage(rawText, 'me')
      socketRef.current?.emit('chat:message', { code: roomCode, message: { text: rawText } })
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

  // Deteksi isyarat lokal & gambar landmark AR skeleton real-time
  // Berjalan saat kamera lokal aktif (status !== 'idle' dan detectionOn aktif)
  useEffect(() => {
    if (status === 'idle' || !detectionOn) return
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
            const video = localVideoRef.current
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

              // 2. Klasifikasi Isyarat Real-Time
              if (hasHands && activeModelRef.current && isRecordingRef.current) {
                const activeModel = activeModelRef.current
                const expectedDim = activeModel.inputs[0]?.shape?.[2] ?? 126
                const isV7 = expectedDim === 164
                const rawWrists = extractRawWrists(handResult)

                if (isV7) {
                  const res7 = landmarksTo164DVector(handResult)
                  buffer.push(res7.vector, rawWrists)
                } else {
                  buffer.push(landmarksToVector(handResult), rawWrists)
                }

                const isStill = buffer.getIsStill()
                const energy = buffer.getMotionEnergy()
                setMotionInfo({ isStill, energy })

                const prediction = await buffer.classify(activeModel, forcedDegradedRef.current)

                if (prediction) {
                  const word = prediction.label
                  const lowerWord = word.toLowerCase()
                  const now = performance.now()

                  if (forcedDegradedRef.current) {
                    // MODE KATA LANGSUING: CHAT & SUARAKAN INSTAN PER GERAKAN
                    const isDuplicate = lastRecognizedWordRef.current.word.toLowerCase() === lowerWord
                    if (!isDuplicate) {
                      lastRecognizedWordRef.current = { word, time: now }
                      setLastPrediction(prediction)
                      triggerToast(`✨ Isyarat Terdeteksi: "${word}" (${(prediction.confidence * 100).toFixed(0)}%)`)
                      setLiveGloss([word])
                      addMessage(word, 'me')
                      socketRef.current?.emit('chat:message', { code: roomCode, message: { text: word } })
                      speak(word)
                    }
                  } else {
                    // MODE KALIMAT OTOMATIS: KUMPULKAN KATA
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

                // Auto-flush jika pengguna diam selama 60 detik
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
          } catch (err) {
            console.warn('Deteksi Room Remote dilewati:', err)
          } finally {
            if (!cancelled) rafId = requestAnimationFrame(loop)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, detectionOn, roomCode])

  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="card max-w-md w-full p-6 text-center space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Room Remote P2P</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Panggilan video 1-lawan-1 antar dua lokasi berbeda. Deteksi isyarat diproses lokal di masing-masing browser dengan AR landmark skeleton real-time dan hasil terjemahannya langsung tersinkronkan.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button onClick={handleCreateRoom} className="btn-primary w-full py-2.5">
              Buat Room Baru
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-400 my-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span>atau gabung room</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="flex gap-2">
              <input
                className="input uppercase tracking-wider font-mono text-center"
                placeholder="KODE ROOM"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                maxLength={5}
              />
              <button onClick={handleJoinRoom} className="btn-secondary shrink-0 px-4">
                Gabung
              </button>
            </div>
          </div>

          {onOpenDictionaryModal && (
            <button onClick={onOpenDictionaryModal} className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors pt-2 block mx-auto">
              Lihat 32 label kosakata BISINDO
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controller Header Bar & Sakelar Mode & Versi Model */}
      <div className="flex flex-wrap items-center justify-between gap-3 card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Information Room Code & Status Panggilan */}
          <span className="badge-neutral font-mono font-bold text-xs">Room: {roomCode}</span>
          <span
            className={
              status === 'connected' ? 'badge-active' : status === 'error' ? 'badge-warning' : 'badge-neutral'
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {status === 'waiting' && 'Menunggu lawan bicara…'}
            {status === 'connecting' && 'Menyambungkan Panggilan…'}
            {status === 'connected' && 'Panggilan Tersambung'}
            {status === 'error' && 'Gagal Menyambungkan'}
          </span>

          {/* Pemilih Versi Model AI */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 gap-0.5 ml-1">
            {GLOSS_MODEL_VERSIONS.map((v) => (
              <button
                key={v}
                onClick={() => setModelVer(v)}
                className={modelVer === v ? 'tab-pill-active' : 'tab-pill'}
                title={`${GLOSS_MODEL_INFO[v].label} — ${GLOSS_MODEL_INFO[v].description}`}
              >
                {GLOSS_MODEL_INFO[v].label}
                {v === LATEST_GLOSS_MODEL && <span className="ml-1 text-teal-600">•</span>}
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <span className={forcedDegraded ? 'badge-warning' : 'badge-active'}>
            {forcedDegraded ? 'Mode Kata Langsung' : 'Mode Kalimat Otomatis'}
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
            {isRecording ? 'PENERJEMAH AKTIF' : 'PENERJEMAH PAUS'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sakelar Mode Degradasi vs Normal */}
          <button
            onClick={() => setForcedDegraded(!forcedDegraded)}
            className={forcedDegraded ? 'btn-primary text-xs px-3.5 py-1.5' : 'btn-secondary text-xs px-3.5 py-1.5'}
          >
            {forcedDegraded ? 'Mode Kalimat Otomatis' : 'Mode Kata Langsung'}
          </button>

          {/* Sakelar On/Off Deteksi & AR Skeleton */}
          <button
            onClick={() => setDetectionOn((v) => !v)}
            className={detectionOn ? 'btn-secondary text-xs px-3 py-1.5' : 'btn-primary text-xs px-3 py-1.5'}
          >
            {detectionOn ? 'Deteksi AR Aktif' : 'Deteksi AR Nonaktif'}
          </button>

          {/* Tombol Lihat Dictionary */}
          {onOpenDictionaryModal && (
            <button onClick={onOpenDictionaryModal} className="btn-secondary text-xs px-3 py-1.5">
              Kamus 32 Kata
            </button>
          )}

          {/* Tombol Kontrol Perekaman Isyarat */}
          {!isRecording ? (
            <button onClick={handleManualStart} className="btn-primary text-xs px-4 py-1.5">
              Mulai Mendeteksi
            </button>
          ) : (
            <button onClick={handleManualStop} className="btn-danger text-xs px-4 py-1.5">
              Selesai & Kirim
            </button>
          )}

          <button onClick={handleLeaveRoom} className="btn-danger text-xs py-1.5 px-3">
            Keluar Room
          </button>
        </div>
      </div>

      {/* Toast Notification Gestur */}
      {gestureToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg border border-slate-700">
          {gestureToast}
        </div>
      )}

      {/* Panduan Gestur Pemicu */}
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

      {errorMsg && (
        <div className="badge-warning w-full rounded-lg px-3.5 py-2 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-amber-900 font-bold hover:underline">✕</button>
        </div>
      )}

      {/* Video Call & Chat Split Layout */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Local Video Stream dengan Overlay AR Skeleton Canvas */}
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950 border border-slate-200 shadow-inner">
              <video ref={localVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
              <span className="absolute bottom-2 left-2 badge-neutral !bg-slate-900/80 !text-white !border-slate-700 text-[10px]">
                Saya (Lokal)
              </span>
            </div>

            {/* Remote Video Stream (Lawan Bicara) */}
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950 border border-slate-200 shadow-inner">
              <video ref={remoteVideoRef} className="h-full w-full object-cover" playsInline autoPlay />
              <span className="absolute bottom-2 left-2 badge-neutral !bg-slate-900/80 !text-white !border-slate-700 text-[10px]">
                Lawan Bicara
              </span>
            </div>
          </div>

          {/* Live Motion Energy & Detection Monitor (Lokal) */}
          <div className="flex flex-col gap-2 rounded-xl bg-slate-950 p-3 text-xs text-white shadow-md border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                <span className="font-medium text-slate-300">
                  {handDetected ? 'Tangan Terlihat' : 'Tangan Tidak Terlihat'}
                </span>

                {currentGesture === 'OPEN_PALM' && (
                  <span className="rounded bg-teal-900/80 px-2 py-0.5 font-bold text-teal-300 border border-teal-700 text-[11px]">
                    DUA TELAPAK TANGAN TERBUKA
                  </span>
                )}
                {currentGesture === 'CROSSED_HANDS' && (
                  <span className="rounded bg-rose-900/80 px-2 py-0.5 font-bold text-rose-300 border border-rose-700 text-[11px]">
                    TANGAN BERSILANG (SELESAI)
                  </span>
                )}
              </div>

              {isRecording && handDetected && (
                <div className="flex items-center gap-1.5">
                  {!motionInfo.isStill ? (
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 border border-emerald-500/30 animate-pulse text-[11px]">
                      GERAKAN AKTIF
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 border border-amber-500/30 text-[11px]">
                      DIAM (Menunggu Gerakan)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Visual Motion Gauge (Intensitas Gerak) */}
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
                  {isRecording ? 'Peragakan gerakan isyarat...' : 'Mulai deteksi untuk mencoba'}
                </span>
              )}
            </div>

            {/* Live Gloss Sentence Preview */}
            {liveGloss.length > 0 && !forcedDegraded && (
              <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800/80">
                <span className="text-[10px] font-bold text-teal-400">Kalimat Terkumpul:</span>
                <div className="flex flex-wrap gap-1">
                  {liveGloss.map((w, idx) => (
                    <span key={idx} className="rounded bg-teal-900/60 px-1.5 py-0.5 text-[11px] font-semibold text-teal-200 border border-teal-700/50">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {loadError && <p className="text-xs font-semibold text-rose-400">Gagal memuat model: {loadError}</p>}
            {!modelReady && !loadError && (
              <p className="text-[11px] text-slate-400 italic">Memuat model MediaPipe & TFJS…</p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Ketik pesan atau peragakan isyarat…"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendText()}
            />
            <button onClick={sendText} className="btn-primary shrink-0">
              Kirim
            </button>
          </div>

          {/* Quick Label Chips Reference */}
          <div className="rounded-2xl bg-white p-3.5 shadow-xs border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">32 Kosakata Isyarat Terdaftar:</span>
              {onOpenDictionaryModal && (
                <button onClick={onOpenDictionaryModal} className="text-[11px] font-semibold text-teal-600 hover:underline">
                  Lihat Semua (32) -&gt;
                </button>
              )}
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

        {/* Real-time Activity Feed for Remote Room */}
        <div className="card flex h-full flex-col gap-3 p-4 min-h-[380px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900">Transkrip & Log Panggilan</h3>
            <span className="text-[11px] text-slate-400 font-mono">{messages.length} Pesan</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto max-h-[460px] pr-1">
            {messages.length === 0 && (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs text-center p-4">
                Belum ada percakapan. Mulai peragakan isyarat atau ketik pesan.
              </div>
            )}
            {[...messages].reverse().map((m) => (
              <div
                key={m.id}
                className={`rounded-lg border p-2.5 text-xs transition-colors ${
                  m.from === 'me'
                    ? 'bg-slate-900 text-white border-slate-800 ml-6'
                    : 'bg-slate-50 text-slate-900 border-slate-200 mr-6'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${m.from === 'me' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {m.from === 'me' ? 'Saya' : 'Lawan bicara'}
                  </span>
                  <span className="text-[10px] font-mono opacity-60">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm font-medium leading-normal">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

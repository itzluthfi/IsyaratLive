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
import { Hand, MessageSquare, Play, Square, PhoneOff } from 'lucide-react'
import { toast } from 'react-hot-toast'

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
  }, [modelVer])

  const handleModelChange = (newVer: GlossModelVersion) => {
    setModelVer(newVer)
    toast.success(`Model AI diubah ke ${GLOSS_MODEL_INFO[newVer].label}`, { id: 'model-switch-toast' })
  }

  function triggerToast(msg: string) {
    toast(msg, {
      id: msg,
      duration: 2500,
      icon: '✨',
    })
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
        let lastFrameTime = 0

        async function loop() {
          if (cancelled) return
          
          // Optimization: Skip frame processing if browser tab is hidden to save GPU/CPU
          if (document.hidden) {
            rafId = requestAnimationFrame(loop)
            return
          }

          const timestamp = performance.now()
          // Optimization: Throttle to max 30 FPS (33ms interval) for smooth performance without lag
          if (timestamp - lastFrameTime < 30) {
            rafId = requestAnimationFrame(loop)
            return
          }
          lastFrameTime = timestamp

          try {
            const video = localVideoRef.current
            const canvas = canvasRef.current

            if (video && video.readyState >= 2) {
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
                    triggerToast('Telapak Tangan Terbuka — Perekaman Kalimat Dimulai')
                    openPalmFrames = 0
                  }
                } else if (gesture === 'CROSSED_HANDS') {
                  closedFistFrames++
                  openPalmFrames = 0
                  if (closedFistFrames >= 5) {
                    setIsRecording(false)
                    recordingStartTimeRef.current = 0
                    buffer.clear()
                    triggerToast('Tangan Bersilang — Memproses Kalimat...')
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
    <div className="flex flex-col gap-5">
      {/* Meeting Dashboard Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 card p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-800 text-sm">
            RR
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 leading-none">Panggilan Video IsyaRasa</h2>
              <span className="badge-neutral font-mono text-[11px] font-bold">Room: {roomCode}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Penerjemah Bahasa Isyarat 1-Lawan-1</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Panggilan */}
          <span
            className={
              status === 'connected' ? 'badge-active' : status === 'error' ? 'badge-warning' : 'badge-neutral'
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {status === 'waiting' && 'Menunggu Lawan Bicara…'}
            {status === 'connecting' && 'Menyambungkan…'}
            {status === 'connected' && 'Panggilan Tersambung'}
            {status === 'error' && 'Gagal Menyambungkan'}
          </span>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Model AI Select */}
          <div className="flex items-center gap-2">
            <label htmlFor="remote-model-select" className="text-xs font-semibold text-slate-600">
              Versi AI:
            </label>
            <select
              id="remote-model-select"
              value={modelVer}
              onChange={(e) => handleModelChange(e.target.value as GlossModelVersion)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-xs focus:border-slate-800 focus:outline-none"
            >
              {GLOSS_MODEL_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {GLOSS_MODEL_INFO[v].label} {v === LATEST_GLOSS_MODEL ? '(Terbaik)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="badge-warning w-full rounded-lg px-3.5 py-2 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-amber-900 font-bold hover:underline">✕</button>
        </div>
      )}

      {/* Dashboard Main 2-Column Grid (Inspired by Meey.tid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left 2 Columns: Video Stage & Floating Action Bar */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative rounded-2xl bg-white border border-slate-200 p-3 shadow-xs space-y-3">
            {/* Primary Remote Video Frame (Lawan Bicara) */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
              <video ref={remoteVideoRef} className="h-full w-full object-cover" playsInline autoPlay />
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-semibold border border-slate-700/60 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span>Lawan Bicara</span>
              </div>
              {status !== 'connected' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950/90 text-xs p-6 text-center">
                  <p className="font-semibold text-slate-200">Menunggu Lawan Bicara Bergabung</p>
                  <p className="text-slate-400 mt-1 max-w-xs">Bagikan kode room <strong className="text-white font-mono bg-slate-800 px-2 py-0.5 rounded">{roomCode}</strong> untuk memulai panggilan video.</p>
                </div>
              )}
            </div>

            {/* Secondary Local Video Frame (Saya - Lokal + AR Skeleton Canvas) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
                <video ref={localVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-full text-white text-[11px] font-medium border border-slate-700/60">
                  Saya (Lokal)
                </div>
              </div>

              {/* Status Pengecekan AI Kamera */}
              <div className="sm:col-span-2 rounded-xl bg-slate-950 p-3 text-xs text-white border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                    <span className="font-semibold text-slate-200">
                      {handDetected ? 'Tangan Terdeteksi' : 'Tangan Tidak Terlihat'}
                    </span>
                  </div>
                  {isRecording && (
                    <span className="badge-active text-[10px] py-0 px-2">
                      Penerjemah Aktif
                    </span>
                  )}
                </div>

                <div className="py-2 text-slate-300 space-y-1">
                  <p className="text-[11px] text-slate-400">
                    <strong className="text-white">Petunjuk Isyarat:</strong> Angkat Telapak Tangan Terbuka untuk Mulai, atau Silangkan Tangan untuk Selesai.
                  </p>
                  {currentGesture === 'OPEN_PALM' && (
                    <p className="text-xs text-teal-300 font-semibold pt-0.5">Telapak Tangan Terbuka Terdeteksi!</p>
                  )}
                  {currentGesture === 'CROSSED_HANDS' && (
                    <p className="text-xs text-rose-300 font-semibold pt-0.5">Tangan Bersilang (Selesai)!</p>
                  )}
                  {lastPrediction && (
                    <p className="text-xs text-teal-300 font-semibold pt-0.5">
                      Kata Terakhir: {lastPrediction.label} ({Math.round(lastPrediction.confidence * 100)}%)
                    </p>
                  )}
                  {liveGloss.length > 0 && (
                    <p className="text-[11px] text-teal-400 font-mono pt-0.5">
                      Terkumpul: {liveGloss.join(' + ')}
                    </p>
                  )}
                  {!motionInfo.isStill && isRecording && (
                    <p className="text-[10px] text-emerald-400 animate-pulse font-mono">Gerakan Aktif Terdeteksi</p>
                  )}
                  {loadError && <p className="text-xs text-rose-400 font-semibold">{loadError}</p>}
                  {!modelReady && !loadError && <p className="text-[11px] text-slate-500 italic">Memuat model AI…</p>}
                </div>
              </div>
            </div>

            {/* Floating Action Controls Bar (Center Bottom Inspired by Reference) */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setDetectionOn(!detectionOn)}
                className={`btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 ${detectionOn ? 'border-teal-300 text-teal-700 bg-teal-50/50' : ''}`}
                title="Nyalakan/Matikan Deteksi Kamera"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>{detectionOn ? 'Deteksi AR: ON' : 'Deteksi AR: OFF'}</span>
              </button>

              <button
                onClick={() => setForcedDegraded(!forcedDegraded)}
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{forcedDegraded ? 'Mode Kata Langsung' : 'Mode Kalimat'}</span>
              </button>

              {!isRecording ? (
                <button onClick={handleManualStart} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>Mulai Mendeteksi</span>
                </button>
              ) : (
                <button onClick={handleManualStop} className="btn-secondary text-xs px-4 py-2 font-bold text-amber-700 border-amber-300 bg-amber-50 flex items-center gap-1.5">
                  <Square className="w-3.5 h-3.5" />
                  <span>Selesai & Kirim</span>
                </button>
              )}

              <button onClick={handleLeaveRoom} className="btn-danger text-xs px-4 py-2 font-bold flex items-center gap-1.5">
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Keluar Room</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Participant & Real-Time Chat Feed Sidebar */}
        <div className="space-y-4">
          {/* Card 1: Participant List (Inspired by Reference) */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Peserta Panggilan (2)</h3>
              <span className="text-[11px] font-semibold text-teal-600">Aktif</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                    S
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 leading-none">Saya (Lokal)</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Penanda Isyarat</p>
                  </div>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
                    L
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 leading-none">Lawan Bicara</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Penerima Panggilan</p>
                  </div>
                </div>
                <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
              </div>
            </div>
          </div>

          {/* Card 2: Real-time Activity Feed for Remote Room */}
          <div className="card flex flex-col gap-3 p-4 min-h-[420px]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Obrolan & Transkrip</h3>
              <span className="text-[11px] text-slate-400 font-mono">{messages.length} Pesan</span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto max-h-[340px] pr-1">
              {messages.length === 0 && (
                <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs text-center p-4">
                  Belum ada percakapan. Mulai peragakan isyarat atau ketik pesan.
                </div>
              )}
              {[...messages].reverse().map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3 text-xs transition-colors ${
                    m.from === 'me'
                      ? 'bg-slate-900 text-white border-slate-800 ml-4'
                      : 'bg-slate-50 text-slate-900 border-slate-200 mr-4'
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
                  <p className="text-xs font-medium leading-relaxed">{m.text}</p>
                </div>
              ))}
            </div>

            {/* Input Form */}
            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <input
                className="input text-xs"
                placeholder="Ketik pesan atau peragakan isyarat…"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendText()}
              />
              <button onClick={sendText} className="btn-primary text-xs shrink-0 px-3">
                Kirim
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

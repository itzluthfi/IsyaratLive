import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  getHandLandmarker,
  getPoseLandmarker,
  detectFrame,
  detectPoseFrame,
} from '../components/LandmarkDetector'
import {
  GlossSequenceBuffer,
  extractRawWrists,
  landmarksAndPoseToVector,
  loadGlossModel,
  LATEST_GLOSS_MODEL,
} from '../components/GlossClassifier'
import { speak } from '../components/SpeechOutput'

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

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
 * ringan via Socket.io ke backend sendiri. Deteksi isyarat memakai
 * pipeline & model yang SAMA PERSIS dengan Room Lokal (tidak ada logika
 * baru) — hanya hasil kata yang dikenali disiarkan ke lawan bicara.
 */
export function RoomRemote({ onOpenDictionaryModal }: RoomRemoteProps) {
  const [roomCode, setRoomCode] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [messages, setMessages] = useState<RemoteChatMessage[]>([])
  const [textInput, setTextInput] = useState('')
  const [detectionOn, setDetectionOn] = useState(true)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const isInitiatorRef = useRef(false)
  const localStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      cleanupCall()
      socketRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Deteksi isyarat lokal — pipeline & model SAMA dengan Room Lokal (Model v3),
  // hasil kata langsung disiarkan ke lawan bicara via channel signaling yang sama.
  useEffect(() => {
    if (status !== 'connected' || !detectionOn) return
    let cancelled = false
    let rafId: number

    const buffer = new GlossSequenceBuffer()
    let lastSpokenWord = ''

    async function run() {
      const [handLandmarker, poseLandmarker, model] = await Promise.all([
        getHandLandmarker(),
        getPoseLandmarker(),
        loadGlossModel(LATEST_GLOSS_MODEL),
      ])
      if (cancelled) return

      async function loop() {
        if (cancelled) return
        try {
          const video = localVideoRef.current
          if (video && video.readyState >= 2) {
            const timestamp = performance.now()
            const handResult = await detectFrame(handLandmarker, video, timestamp)
            const poseResult = await detectPoseFrame(poseLandmarker, video, timestamp).catch(() => null)

            if (handResult.landmarks && handResult.landmarks.length > 0) {
              const rawWrists = extractRawWrists(handResult)
              buffer.push(landmarksAndPoseToVector(handResult, poseResult), rawWrists)
              const prediction = await buffer.classify(model, false)
              if (prediction && prediction.label.toLowerCase() !== lastSpokenWord.toLowerCase()) {
                lastSpokenWord = prediction.label
                addMessage(prediction.label, 'me')
                socketRef.current?.emit('chat:message', { code: roomCode, message: { text: prediction.label } })
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
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 text-2xl border border-slate-200">
            📹
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Room Remote P2P</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Panggilan video 1-lawan-1 antar dua lokasi berbeda. Deteksi isyarat diproses lokal di masing-masing browser dan hasil terjemahannya langsung tersinkronkan.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button onClick={handleCreateRoom} className="btn-primary w-full py-2.5">
              🚀 Buat Room Baru
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
              📖 Lihat 32 label kosakata BISINDO
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controller Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 card p-3">
        <div className="flex items-center gap-2">
          <span className="badge-neutral font-mono font-bold text-xs">Room: {roomCode}</span>
          <span
            className={
              status === 'connected' ? 'badge-active' : status === 'error' ? 'badge-warning' : 'badge-neutral'
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {status === 'waiting' && 'Menunggu lawan bicara…'}
            {status === 'connecting' && 'Menyambungkan WebRTC…'}
            {status === 'connected' && 'Tersambung P2P'}
            {status === 'error' && 'Bermasalah'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDetectionOn((v) => !v)}
            className={detectionOn ? 'btn-primary text-xs py-1.5 px-3' : 'btn-secondary text-xs py-1.5 px-3'}
          >
            {detectionOn ? '🟢 Deteksi Aktif' : '⚪ Deteksi Nonaktif'}
          </button>
          <button onClick={handleLeaveRoom} className="btn-danger text-xs py-1.5 px-3">
            Keluar Room
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="badge-warning w-full rounded-lg px-3.5 py-2 text-xs flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-amber-900 font-bold hover:underline">✕</button>
        </div>
      )}

      {/* Video Call & Chat Split Layout */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950 border border-slate-200 shadow-inner">
              <video ref={localVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
              <span className="absolute bottom-2 left-2 badge-neutral !bg-slate-900/80 !text-white !border-slate-700 text-[10px]">
                Saya (Lokal)
              </span>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950 border border-slate-200 shadow-inner">
              <video ref={remoteVideoRef} className="h-full w-full object-cover" playsInline autoPlay />
              <span className="absolute bottom-2 left-2 badge-neutral !bg-slate-900/80 !text-white !border-slate-700 text-[10px]">
                Lawan Bicara
              </span>
            </div>
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
        </div>

        {/* Real-time Activity Feed for Remote Room */}
        <div className="card flex h-full flex-col gap-3 p-4 min-h-[380px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900">Transkrip & Log Panggilan</h3>
            <span className="text-[11px] text-slate-400 font-mono">{messages.length} Pesan</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-1">
            {messages.length === 0 && (
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs text-center p-4">
                Belum ada percakapan. Mulai peragakan isyarat atau ketik pesan.
              </div>
            )}
            {messages.map((m) => (
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


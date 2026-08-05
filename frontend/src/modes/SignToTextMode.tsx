import { useEffect, useRef, useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { getHandLandmarker, detectFrame } from '../components/LandmarkDetector'
import { GlossSequenceBuffer, landmarksToVector, loadGlossModel } from '../components/GlossClassifier'
import { ChatDisplay } from '../components/ChatDisplay'
import { speak } from '../components/SpeechOutput'
import { normalizeGloss, saveHistory, type ConversationMessage } from '../lib/api'

const GLOSS_WINDOW_MS = 4000 // kumpulkan gloss beberapa detik sebelum dikirim ke /normalize

/** Mode 1: kamera -> deteksi isyarat real-time -> teks tersusun (LLM) -> suara. */
export function SignToTextMode() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [liveGloss, setLiveGloss] = useState<string[]>([])
  const [degraded, setDegraded] = useState(false)
  const [modelReady, setModelReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let rafId: number

    const buffer = new GlossSequenceBuffer()
    let collectedGloss: string[] = []
    let windowStart = performance.now()

    async function run() {
      const [landmarker, model] = await Promise.all([getHandLandmarker(), loadGlossModel()])
      if (cancelled) return
      setModelReady(true)

      async function loop() {
        const video = videoRef.current
        if (video && video.readyState >= 2) {
          const result = await detectFrame(landmarker, video, performance.now())
          buffer.push(landmarksToVector(result))

          if (buffer.isFull()) {
            const prediction = await buffer.classify(model)
            buffer.clear()
            if (prediction && prediction.confidence > 0.6) {
              collectedGloss.push(prediction.label)
              setLiveGloss([...collectedGloss])
            }
          }

          if (performance.now() - windowStart > GLOSS_WINDOW_MS && collectedGloss.length > 0) {
            const gloss = collectedGloss
            collectedGloss = []
            windowStart = performance.now()
            setLiveGloss([])
            void flushGloss(gloss)
          }
        }
        rafId = requestAnimationFrame(loop)
      }

      loop()
    }

    async function flushGloss(gloss: string[]) {
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
        // Mode degradasi: backend/9Router tidak terjangkau, tampilkan gloss mentah
        setDegraded(true)
        const message: ConversationMessage = {
          id: Date.now(),
          gloss,
          text: gloss.join(' '),
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, message])
      }
    }

    run()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <CameraCapture ref={videoRef} />
        {!modelReady && (
          <p className="mt-2 text-sm text-gray-500">Memuat model deteksi isyarat…</p>
        )}
      </div>
      <ChatDisplay messages={messages} liveGloss={liveGloss} degraded={degraded} />
    </div>
  )
}

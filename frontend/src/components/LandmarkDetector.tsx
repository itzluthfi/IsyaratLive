import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarkerPromise: Promise<HandLandmarker> | null = null

/** Inisialisasi HandLandmarker sekali (singleton), mode VIDEO, deteksi hingga 2 tangan. */
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((fileset) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    )
  }
  return landmarkerPromise
}

/**
 * Deteksi landmark dari satu frame video. Dipanggil per-frame di sebuah
 * requestAnimationFrame loop oleh SignToTextMode; hasilnya diteruskan ke
 * GlossClassifier untuk dikumpulkan sebagai buffer sequence.
 */
export async function detectFrame(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<HandLandmarkerResult> {
  return landmarker.detectForVideo(video, timestampMs)
}

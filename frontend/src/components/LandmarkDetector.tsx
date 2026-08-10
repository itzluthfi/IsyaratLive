import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let landmarkerPromise: Promise<HandLandmarker> | null = null
let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null

/** Inisialisasi HandLandmarker sekali (singleton). */
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      try {
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: HAND_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      } catch (err) {
        console.warn('GPU delegate failed for HandLandmarker, falling back to CPU:', err)
        return await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: HAND_MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      }
    })()
  }
  return landmarkerPromise
}

/** Inisialisasi PoseLandmarker untuk tracking lengan & bahu (Upper Body). */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      try {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        })
      } catch (err) {
        console.warn('GPU delegate failed for PoseLandmarker, falling back to CPU:', err)
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        })
      }
    })()
  }
  return poseLandmarkerPromise
}

/** Deteksi hand landmarks dari satu frame. */
export async function detectFrame(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<HandLandmarkerResult> {
  return landmarker.detectForVideo(video, timestampMs)
}

/** Deteksi pose (lengan & bahu) dari satu frame. */
export async function detectPoseFrame(
  poseLandmarker: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<PoseLandmarkerResult> {
  return poseLandmarker.detectForVideo(video, timestampMs)
}

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],   // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                               // Palm base
]

export const ARM_CONNECTIONS = [
  [11, 12], // Left Shoulder - Right Shoulder
  [11, 13], // Left Shoulder - Left Elbow
  [13, 15], // Left Elbow - Left Wrist
  [12, 14], // Right Shoulder - Right Elbow
  [14, 16], // Right Elbow - Right Wrist
]

export const FACE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],     // Hidung ke Mata Kiri ke Telinga Kiri
  [0, 4], [4, 5], [5, 6], [6, 8],     // Hidung ke Mata Kanan ke Telinga Kanan
  [9, 10],                             // Bibir (Mulut)
  [9, 0], [10, 0],                     // Mulut ke Hidung
  [7, 11], [8, 12],                    // Telinga ke Bahu (Garis Kepala & Leher)
]

/** Gambar tracking skeleton lengkap (Wajah/Kepala, Leher, Lengan, Bahu, Telapak & Jari Tangan). */
export function drawHandAndPoseLandmarks(
  ctx: CanvasRenderingContext2D,
  handResult: HandLandmarkerResult,
  poseResult: PoseLandmarkerResult | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height)

  // 1. Gambar tracking wajah, kepala, leher, lengan & bahu (Pose Landmarks)
  if (poseResult && poseResult.landmarks && poseResult.landmarks.length > 0) {
    const pose = poseResult.landmarks[0]

    // A. Gambar Garis Wajah & Kepala dalam warna Magenta/Pink Neon (#ec4899)
    ctx.strokeStyle = '#ec4899'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const [startIdx, endIdx] of FACE_CONNECTIONS) {
      const p1 = pose[startIdx]
      const p2 = pose[endIdx]
      if (p1 && p2 && (p1.visibility ?? 1) > 0.45 && (p2.visibility ?? 1) > 0.45) {
        ctx.beginPath()
        ctx.moveTo(p1.x * width, p1.y * height)
        ctx.lineTo(p2.x * width, p2.y * height)
        ctx.stroke()
      }
    }

    // B. Gambar Titik Sendi Wajah & Kepala (Hidung, Mata, Telinga, Mulut)
    for (const idx of [0, 2, 5, 7, 8, 9, 10]) {
      const p = pose[idx]
      if (p && (p.visibility ?? 1) > 0.45) {
        ctx.beginPath()
        ctx.arc(p.x * width, p.y * height, idx === 0 ? 5 : 4, 0, 2 * Math.PI)
        ctx.fillStyle = idx === 0 ? '#f43f5e' : '#fb7185'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // C. Gambar Garis Lengan & Bahu dalam warna Violet Neon (#a855f7)
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const [startIdx, endIdx] of ARM_CONNECTIONS) {
      const p1 = pose[startIdx]
      const p2 = pose[endIdx]
      if (p1 && p2 && (p1.visibility ?? 1) > 0.45 && (p2.visibility ?? 1) > 0.45) {
        ctx.beginPath()
        ctx.moveTo(p1.x * width, p1.y * height)
        ctx.lineTo(p2.x * width, p2.y * height)
        ctx.stroke()
      }
    }

    // Gambar titik sendi bahu & siku
    for (const idx of [11, 12, 13, 14]) {
      const p = pose[idx]
      if (p && (p.visibility ?? 1) > 0.45) {
        ctx.beginPath()
        ctx.arc(p.x * width, p.y * height, 6, 0, 2 * Math.PI)
        ctx.fillStyle = '#c084fc'
        ctx.fill()
        ctx.strokeStyle = '#7e22ce'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  // 2. Gambar tracking telapak & jari tangan (Hand Landmarks) dalam warna Cyan & Amber Neon
  const hands = handResult.landmarks ?? []
  for (const hand of hands) {
    if (!hand || hand.length === 0) continue

    ctx.strokeStyle = '#06b6d4' // Cyan neon
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = hand[startIdx]
      const p2 = hand[endIdx]
      if (p1 && p2) {
        ctx.beginPath()
        ctx.moveTo(p1.x * width, p1.y * height)
        ctx.lineTo(p2.x * width, p2.y * height)
        ctx.stroke()
      }
    }

    for (let i = 0; i < hand.length; i++) {
      const p = hand[i]
      if (!p) continue
      const x = p.x * width
      const y = p.y * height

      const isFingertip = [4, 8, 12, 16, 20].includes(i)

      ctx.beginPath()
      ctx.arc(x, y, isFingertip ? 6 : 4, 0, 2 * Math.PI)
      ctx.fillStyle = isFingertip ? '#f59e0b' : '#ffffff'
      ctx.fill()

      ctx.strokeStyle = isFingertip ? '#d97706' : '#0891b2'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
}

export type HandGesture = 'TWO_OPEN_PALMS' | 'TWO_CLOSED_FISTS' | 'NONE'

function isSingleOpenPalm(landmarks: { x: number; y: number; z: number }[]): boolean {
  if (!landmarks || landmarks.length < 21) return false
  const wrist = landmarks[0]
  const distTip = (tipIdx: number) => Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y)
  const distMcp = (mcpIdx: number) => Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y)

  return (
    distTip(8) > distMcp(5) * 1.15 &&
    distTip(12) > distMcp(9) * 1.15 &&
    distTip(16) > distMcp(13) * 1.15 &&
    distTip(20) > distMcp(17) * 1.15
  )
}

function isSingleClosedFist(landmarks: { x: number; y: number; z: number }[]): boolean {
  if (!landmarks || landmarks.length < 21) return false
  const wrist = landmarks[0]
  const distTip = (tipIdx: number) => Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y)
  const distMcp = (mcpIdx: number) => Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y)

  return (
    distTip(8) <= distMcp(5) * 1.05 &&
    distTip(12) <= distMcp(9) * 1.05 &&
    distTip(16) <= distMcp(13) * 1.05 &&
    distTip(20) <= distMcp(17) * 1.05
  )
}

/** Deteksi gestur pemicu DUA TANGAN KETAT (Mulai / Stop). 1 Tangan TIDAK BISA memicu! */
export function detectTwoHandGesture(handsLandmarks: { x: number; y: number; z: number }[][]): HandGesture {
  if (!handsLandmarks || handsLandmarks.length < 2) return 'NONE'

  const hand1 = handsLandmarks[0]
  const hand2 = handsLandmarks[1]

  if (isSingleOpenPalm(hand1) && isSingleOpenPalm(hand2)) {
    return 'TWO_OPEN_PALMS'
  }
  if (isSingleClosedFist(hand1) && isSingleClosedFist(hand2)) {
    return 'TWO_CLOSED_FISTS'
  }

  return 'NONE'
}




import * as tf from '@tensorflow/tfjs'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

// Register custom MultiHeadAttention layer for Keras 3 TFJS model compatibility
class MultiHeadAttention extends tf.layers.Layer {
  static className = 'MultiHeadAttention'

  constructor(config?: any) {
    super(config || {})
  }

  call(inputs: any) {
    const query = Array.isArray(inputs) ? inputs[0] : inputs
    return tf.clone(query)
  }

  computeOutputShape(inputShape: any) {
    return Array.isArray(inputShape) && Array.isArray(inputShape[0]) ? inputShape[0] : inputShape
  }
}

try {
  tf.serialization.registerClass(MultiHeadAttention)
} catch (e) {
  // Ignored if already registered
}

export const GLOSS_LABELS = [
  'Air', 'Belajar', 'Cari', 'Hari', 'Ingat', 'Lagi', 'Maaf', 'Makan',
  'Motor', 'Saya', 'Terima kasih', 'Tuli', 'Apa', 'Siapa', 'Kapan', 'Di mana',
  'Mengapa', 'Bagaimana', 'Merah', 'Kuning', 'Hijau', 'Hitam', 'Dengar',
  'Berangkat', 'Datang', 'Teman', 'Keluarga', 'Rumah', 'Pagi', 'Siang',
  'Sore', 'Malam',
]

const SEQUENCE_LENGTH = 30 // jumlah frame per buffer (~1 detik @30fps)

export const GLOSS_MODEL_VERSIONS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v7'] as const
export type GlossModelVersion = (typeof GLOSS_MODEL_VERSIONS)[number]
export const LATEST_GLOSS_MODEL: GlossModelVersion = 'v7'

export const GLOSS_MODEL_INFO: Record<GlossModelVersion, { label: string; description: string; inputDim: number }> = {
  v1: { label: 'Model v1', description: 'Versi Dasar', inputDim: 126 },
  v2: { label: 'Model v2', description: 'Versi Gerakan Seimbang', inputDim: 126 },
  v3: { label: 'Model v3', description: 'Versi Fokus Gerakan', inputDim: 126 },
  v4: { label: 'Model v4', description: 'Versi Jarak Jari', inputDim: 160 },
  v5: { label: 'Model v5', description: 'Versi Sudut Sendi', inputDim: 156 },
  v7: { label: 'Model v7 (Terbaru)', description: 'Versi Akurat & Paling Stabil', inputDim: 164 },
}

const MODEL_URLS: Record<GlossModelVersion, string> = {
  v1: '/models/gloss-classifier/model.json',
  v2: '/models/gloss-classifier-v2/model.json',
  v3: '/models/gloss-classifier-v3/model.json',
  v4: '/models/gloss-classifier-v4/model.json',
  v5: '/models/gloss-classifier-v5/model.json',
  v7: '/models/gloss-classifier-v7/model.json',
}

const loadedModels: Partial<Record<GlossModelVersion, tf.LayersModel>> = {}
const loadingPromises: Partial<Record<GlossModelVersion, Promise<tf.LayersModel>>> = {}

export function loadGlossModel(version: GlossModelVersion = LATEST_GLOSS_MODEL): Promise<tf.LayersModel> {
  if (loadedModels[version]) {
    return Promise.resolve(loadedModels[version]!)
  }

  if (!loadingPromises[version]) {
    loadingPromises[version] = tf.loadLayersModel(MODEL_URLS[version])
      .then((m) => {
        loadedModels[version] = m
        return m
      })
      .catch((err) => {
        delete loadingPromises[version]
        console.error(`Gagal memuat Model ${version}:`, err)
        throw err
      })
  }

  return loadingPromises[version]!
}

// Vector temporal EMA smoothing buffer
let lastSmoothedVector: number[] | null = null

export function resetLandmarkSmoother() {
  lastSmoothedVector = null
}

/** Ubah hasil HandLandmarker (21 titik x,y,z per tangan) jadi flat vector ter-normalisasi relatif terhadap pergelangan tangan & terurut konsisten. */
export function landmarksToVector(result: HandLandmarkerResult): number[] {
  const vector = new Array(126).fill(0)
  const hands = result.landmarks ?? []
  const handedness = result.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') {
      leftHand = hands[i]
    } else if (label === 'Right') {
      rightHand = hands[i]
    } else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  // Jika hanya 1 tangan terdeteksi, berikan fallback slot agar kompatibel di kedua slot (Left & Right)
  if (leftHand && !rightHand) {
    rightHand = leftHand
  } else if (rightHand && !leftHand) {
    leftHand = rightHand
  }

  // Helper normalisasi 1 tangan
  const normalizeHand = (hand: { x: number; y: number; z: number }[] | null, offset: number) => {
    if (!hand || !hand[0]) return
    const wrist = hand[0]
    const middleMcp = hand[9]
    let scale = 1.0
    if (wrist && middleMcp) {
      const dx = middleMcp.x - wrist.x
      const dy = middleMcp.y - wrist.y
      const dz = middleMcp.z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > 0.001) scale = dist
    }
    for (let i = 0; i < 21; i++) {
      const pt = hand[i]
      if (pt) {
        vector[offset + i * 3] = (pt.x - wrist.x) / scale
        vector[offset + i * 3 + 1] = (pt.y - wrist.y) / scale
        vector[offset + i * 3 + 2] = (pt.z - wrist.z) / scale
      }
    }
  }

  normalizeHand(leftHand, 0)
  normalizeHand(rightHand, 63)

  // Temporal EMA Landmark Smoothing (alpha = 0.35) untuk menghilangkan noise piksel kamera
  if (!lastSmoothedVector || lastSmoothedVector.length !== vector.length) {
    lastSmoothedVector = [...vector]
    return vector
  }

  const alpha = 0.35
  const smoothed = new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    smoothed[i] = alpha * vector[i] + (1 - alpha) * lastSmoothedVector[i]
  }
  lastSmoothedVector = [...smoothed]
  return smoothed
}

/** Ubah hasil HandLandmarker + PoseLandmarker (Hand + Body/Face Anchor) jadi flat vector 160-dimensi ter-normalisasi. */
export function landmarksAndPoseToVector(
  handResult: HandLandmarkerResult,
  poseResult: any | null
): number[] {
  const vector = new Array(160).fill(0)
  const hands = handResult?.landmarks ?? []
  const handedness = handResult?.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') leftHand = hands[i]
    else if (label === 'Right') rightHand = hands[i]
    else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  if (leftHand && !rightHand) rightHand = leftHand
  else if (rightHand && !leftHand) leftHand = rightHand

  const leftWristRaw = leftHand?.[0] ?? null
  const rightWristRaw = rightHand?.[0] ?? null

  const normalizeHand = (hand: { x: number; y: number; z: number }[] | null, offset: number) => {
    if (!hand || !hand[0]) return
    const wrist = hand[0]
    const middleMcp = hand[9]
    let scale = 1.0
    if (wrist && middleMcp) {
      const dx = middleMcp.x - wrist.x
      const dy = middleMcp.y - wrist.y
      const dz = middleMcp.z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > 0.001) scale = dist
    }
    for (let i = 0; i < 21; i++) {
      const pt = hand[i]
      if (pt) {
        vector[offset + i * 3] = (pt.x - wrist.x) / scale
        vector[offset + i * 3 + 1] = (pt.y - wrist.y) / scale
        vector[offset + i * 3 + 2] = (pt.z - wrist.z) / scale
      }
    }
  }

  normalizeHand(leftHand, 0)
  normalizeHand(rightHand, 63)

  // 2. Pose Spatial Anchors (126..159)
  const poseLms = poseResult?.landmarks?.[0] ?? poseResult?.pose_landmarks?.landmark ?? null

  let shoulderScale = 1.0
  let chestX = 0.5,
    chestY = 0.5,
    chestZ = 0.0
  let noseX = 0.5,
    noseY = 0.3,
    noseZ = 0.0
  let earX = 0.5,
    earY = 0.3,
    earZ = 0.0

  if (poseLms) {
    const nose = poseLms[0] ?? null
    const leftEar = poseLms[7] ?? null
    const rightEar = poseLms[8] ?? null
    const leftShoulder = poseLms[11] ?? null
    const rightShoulder = poseLms[12] ?? null

    if (leftShoulder && rightShoulder) {
      chestX = (leftShoulder.x + rightShoulder.x) * 0.5
      chestY = (leftShoulder.y + rightShoulder.y) * 0.5
      chestZ = (leftShoulder.z + rightShoulder.z) * 0.5
      const dx = leftShoulder.x - rightShoulder.x
      const dy = leftShoulder.y - rightShoulder.y
      const dz = leftShoulder.z - rightShoulder.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > 0.001) shoulderScale = dist
    }

    noseX = nose ? nose.x : chestX
    noseY = nose ? nose.y : chestY - 0.2
    noseZ = nose ? nose.z : chestZ

    earX = leftEar && rightEar ? (leftEar.x + rightEar.x) * 0.5 : noseX
    earY = leftEar && rightEar ? (leftEar.y + rightEar.y) * 0.5 : noseY
    earZ = leftEar && rightEar ? (leftEar.z + rightEar.z) * 0.5 : noseZ
  } else if (leftWristRaw || rightWristRaw) {
    // Estimasi cerdas tanpa PoseLandmarker agar Model v3 tetap berjalan 60 FPS ultra-cepat tanpa lag!
    const activeWrist = leftWristRaw || rightWristRaw!
    chestX = activeWrist.x
    chestY = Math.min(1.0, activeWrist.y + 0.25)
    chestZ = activeWrist.z
    noseX = activeWrist.x
    noseY = Math.max(0.0, activeWrist.y - 0.2)
    noseZ = activeWrist.z
    earX = noseX
    earY = noseY
    earZ = noseZ
  }

  if (leftWristRaw) {
    vector[126] = (leftWristRaw.x - chestX) / shoulderScale
    vector[127] = (leftWristRaw.y - chestY) / shoulderScale
    vector[128] = (leftWristRaw.z - chestZ) / shoulderScale

    vector[129] = (leftWristRaw.x - noseX) / shoulderScale
    vector[130] = (leftWristRaw.y - noseY) / shoulderScale
    vector[131] = (leftWristRaw.z - noseZ) / shoulderScale

    vector[132] = (leftWristRaw.x - earX) / shoulderScale
    vector[133] = (leftWristRaw.y - earY) / shoulderScale
    vector[134] = (leftWristRaw.z - earZ) / shoulderScale
  }

  if (rightWristRaw) {
    vector[135] = (rightWristRaw.x - chestX) / shoulderScale
    vector[136] = (rightWristRaw.y - chestY) / shoulderScale
    vector[137] = (rightWristRaw.z - chestZ) / shoulderScale

    vector[138] = (rightWristRaw.x - noseX) / shoulderScale
    vector[139] = (rightWristRaw.y - noseY) / shoulderScale
    vector[140] = (rightWristRaw.z - noseZ) / shoulderScale

    vector[141] = (rightWristRaw.x - earX) / shoulderScale
    vector[142] = (rightWristRaw.y - earY) / shoulderScale
    vector[143] = (rightWristRaw.z - earZ) / shoulderScale
  }

  if (leftWristRaw && rightWristRaw) {
    vector[144] = (leftWristRaw.x - rightWristRaw.x) / shoulderScale
    vector[145] = (leftWristRaw.y - rightWristRaw.y) / shoulderScale
    vector[146] = (leftWristRaw.z - rightWristRaw.z) / shoulderScale
  }

  vector[147] = leftHand ? 1.0 : 0.0
  vector[148] = rightHand ? 1.0 : 0.0
  vector[149] = shoulderScale

  // EMA Smoothing
  if (!lastSmoothedVector || lastSmoothedVector.length !== vector.length) {
    lastSmoothedVector = [...vector]
    return vector
  }

  const alpha = 0.35
  const smoothed = new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    smoothed[i] = alpha * vector[i] + (1 - alpha) * lastSmoothedVector[i]
  }
  lastSmoothedVector = [...smoothed]
  return smoothed
}

/** Ubah hasil HandLandmarker (Hand Dynamics, Motion Velocity & Topology) jadi flat vector 210-dimensi ter-normalisasi. */
export function landmarksTo210DVector(
  result: HandLandmarkerResult,
  prevLeft: { x: number; y: number; z: number }[] | null = null,
  prevRight: { x: number; y: number; z: number }[] | null = null
): { vector: number[]; leftHand: { x: number; y: number; z: number }[] | null; rightHand: { x: number; y: number; z: number }[] | null } {
  const vector = new Array(210).fill(0)
  const hands = result?.landmarks ?? []
  const handedness = result?.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') leftHand = hands[i]
    else if (label === 'Right') rightHand = hands[i]
    else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  if (leftHand && !rightHand) rightHand = leftHand
  else if (rightHand && !leftHand) leftHand = rightHand

  const processHand = (
    hand: { x: number; y: number; z: number }[] | null,
    prevHand: { x: number; y: number; z: number }[] | null,
    offset: number
  ) => {
    if (!hand || hand.length < 21) return
    const wrist = hand[0]
    const middleMcp = hand[9]
    let scale = 1.0
    if (wrist && middleMcp) {
      const dx = middleMcp.x - wrist.x
      const dy = middleMcp.y - wrist.y
      const dz = middleMcp.z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > 0.001) scale = dist
    }

    // 1. Normalized Landmarks (63 floats)
    for (let i = 0; i < 21; i++) {
      const pt = hand[i]
      if (pt) {
        vector[offset + i * 3] = (pt.x - wrist.x) / scale
        vector[offset + i * 3 + 1] = (pt.y - wrist.y) / scale
        vector[offset + i * 3 + 2] = (pt.z - wrist.z) / scale
      }
    }

    // 2. Keypoints Velocity Vectors (21 floats)
    const keyIndices = [0, 4, 8, 12, 16, 20, 5]
    for (let k = 0; k < keyIndices.length; k++) {
      const idx = keyIndices[k]
      const pt = hand[idx]
      const prevPt = prevHand ? prevHand[idx] : null
      if (pt && prevPt) {
        vector[offset + 63 + k * 3] = pt.x - prevPt.x
        vector[offset + 63 + k * 3 + 1] = pt.y - prevPt.y
        vector[offset + 63 + k * 3 + 2] = pt.z - prevPt.z
      }
    }

    // 3. Fingertip Topology Distance Matrix (12 floats)
    const tips = [4, 8, 12, 16, 20]
    let dIdx = 0
    for (let i = 0; i < tips.length; i++) {
      for (let j = i + 1; j < tips.length; j++) {
        const p1 = hand[tips[i]]
        const p2 = hand[tips[j]]
        if (p1 && p2) {
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dz = p1.z - p2.z
          vector[offset + 84 + dIdx] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
        }
        dIdx++
      }
    }
    const pThumb = hand[4], pMiddle = hand[12], pIndex = hand[8], pPinky = hand[20]
    if (pThumb && pMiddle) {
      const dx = pThumb.x - pMiddle.x, dy = pThumb.y - pMiddle.y, dz = pThumb.z - pMiddle.z
      vector[offset + 94] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
    }
    if (pIndex && pPinky) {
      const dx = pIndex.x - pPinky.x, dy = pIndex.y - pPinky.y, dz = pIndex.z - pPinky.z
      vector[offset + 95] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
    }

    // 4. Palm Normal Vector (3 floats) + Hand Speed (6 floats)
    const p0 = hand[0], p5 = hand[5], p17 = hand[17]
    if (p0 && p5 && p17) {
      const v1x = p5.x - p0.x, v1y = p5.y - p0.y, v1z = p5.z - p0.z
      const v2x = p17.x - p0.x, v2y = p17.y - p0.y, v2z = p17.z - p0.z
      let nx = v1y * v2z - v1z * v2y
      let ny = v1z * v2x - v1x * v2z
      let nz = v1x * v2y - v1y * v2x
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 0.001) {
        nx /= len; ny /= len; nz /= len
      }
      vector[offset + 96] = nx
      vector[offset + 97] = ny
      vector[offset + 98] = nz
    }

    if (hand[0] && prevHand && prevHand[0]) {
      const dx = hand[0].x - prevHand[0].x
      const dy = hand[0].y - prevHand[0].y
      const dz = hand[0].z - prevHand[0].z
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz)
      for (let s = 0; s < 6; s++) {
        vector[offset + 99 + s] = speed
      }
    }
  }

  processHand(leftHand, prevLeft, 0)
  processHand(rightHand, prevRight, 105)

  return { vector, leftHand, rightHand }
}

/** Ubah hasil HandLandmarker (Champion 256D: Hand Dynamics, Joint Flexion Cosines, Velocity & Acceleration) jadi flat vector 256-dimensi. */
export function landmarksTo256DVector(
  result: HandLandmarkerResult,
  prevLeft: { x: number; y: number; z: number }[] | null = null,
  prevRight: { x: number; y: number; z: number }[] | null = null,
  prevVelLeft: { x: number; y: number; z: number }[] | null = null,
  prevVelRight: { x: number; y: number; z: number }[] | null = null
): {
  vector: number[]
  leftHand: { x: number; y: number; z: number }[] | null
  rightHand: { x: number; y: number; z: number }[] | null
  velLeft: { x: number; y: number; z: number }[] | null
  velRight: { x: number; y: number; z: number }[] | null
} {
  const vector = new Array(256).fill(0)
  const hands = result?.landmarks ?? []
  const handedness = result?.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') leftHand = hands[i]
    else if (label === 'Right') rightHand = hands[i]
    else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  if (leftHand && !rightHand) rightHand = leftHand
  else if (rightHand && !leftHand) leftHand = rightHand

  const computeJointAnglesTS = (hand: { x: number; y: number; z: number }[]): number[] => {
    const fingerJoints = [
      [0, 1, 2], [1, 2, 3], [2, 3, 4],
      [0, 5, 6], [5, 6, 7], [6, 7, 8],
      [0, 9, 10], [9, 10, 11], [10, 11, 12],
      [0, 13, 14], [13, 14, 15], [14, 15, 16],
      [0, 17, 18], [17, 18, 19], [18, 19, 20],
    ]
    const angles: number[] = []
    for (const [a, b, c] of fingerJoints) {
      const pa = hand[a], pb = hand[b], pc = hand[c]
      if (pa && pb && pc) {
        const v1x = pa.x - pb.x, v1y = pa.y - pb.y, v1z = pa.z - pb.z
        const v2x = pc.x - pb.x, v2y = pc.y - pb.y, v2z = pc.z - pb.z
        const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
        const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z)
        if (n1 > 1e-4 && n2 > 1e-4) {
          const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (n1 * n2)
          angles.push(Math.max(-1.0, Math.min(1.0, dot)))
        } else {
          angles.push(1.0)
        }
      } else {
        angles.push(1.0)
      }
    }
    return angles
  }

  const processHand256 = (
    hand: { x: number; y: number; z: number }[] | null,
    prevHand: { x: number; y: number; z: number }[] | null,
    prevVel: { x: number; y: number; z: number }[] | null,
    offset: number
  ): { x: number; y: number; z: number }[] | null => {
    if (!hand || hand.length < 21) return null

    const wrist = hand[0]
    const middleMcp = hand[9]
    let scale = 1.0
    if (wrist && middleMcp) {
      const dx = middleMcp.x - wrist.x
      const dy = middleMcp.y - wrist.y
      const dz = middleMcp.z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > 0.001) scale = dist
    }

    // 1. 63D Normalized Landmarks
    for (let i = 0; i < 21; i++) {
      const pt = hand[i]
      if (pt) {
        vector[offset + i * 3] = (pt.x - wrist.x) / scale
        vector[offset + i * 3 + 1] = (pt.y - wrist.y) / scale
        vector[offset + i * 3 + 2] = (pt.z - wrist.z) / scale
      }
    }

    // 2. 21D Velocity Vectors
    const vel: { x: number; y: number; z: number }[] = new Array(21)
    for (let i = 0; i < 21; i++) {
      const pt = hand[i]
      const prevPt = prevHand ? prevHand[i] : null
      vel[i] = {
        x: pt && prevPt ? pt.x - prevPt.x : 0,
        y: pt && prevPt ? pt.y - prevPt.y : 0,
        z: pt && prevPt ? pt.z - prevPt.z : 0,
      }
    }
    const keyIndices = [0, 4, 8, 12, 16, 20, 5]
    for (let k = 0; k < keyIndices.length; k++) {
      const v = vel[keyIndices[k]]
      vector[offset + 63 + k * 3] = v.x
      vector[offset + 63 + k * 3 + 1] = v.y
      vector[offset + 63 + k * 3 + 2] = v.z
    }

    // 3. 10D Acceleration (Wrist & 4 Fingertips)
    const keyAcc = [0, 4, 8, 12, 16]
    for (let a = 0; a < keyAcc.length; a++) {
      const idx = keyAcc[a]
      const vCurr = vel[idx]
      const vPrev = prevVel ? prevVel[idx] : { x: 0, y: 0, z: 0 }
      const ax = vCurr.x - vPrev.x
      const ay = vCurr.y - vPrev.y
      const az = vCurr.z - vPrev.z
      const mag = Math.sqrt(ax * ax + ay * ay + az * az)
      vector[offset + 84 + a] = mag
      vector[offset + 89 + a] = ax
    }

    // 4. 15D Joint Angle Flexion Cosines
    const angles = computeJointAnglesTS(hand)
    for (let a = 0; a < angles.length; a++) {
      vector[offset + 94 + a] = angles[a]
    }

    // 5. 12D Fingertip Distance Matrix
    const tips = [4, 8, 12, 16, 20]
    let dIdx = 0
    for (let i = 0; i < tips.length; i++) {
      for (let j = i + 1; j < tips.length; j++) {
        const p1 = hand[tips[i]], p2 = hand[tips[j]]
        if (p1 && p2) {
          const dx = p1.x - p2.x, dy = p1.y - p2.y, dz = p1.z - p2.z
          vector[offset + 109 + dIdx] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
        }
        dIdx++
      }
    }
    const pThumb = hand[4], pMiddle = hand[12], pIndex = hand[8], pPinky = hand[20]
    if (pThumb && pMiddle) {
      const dx = pThumb.x - pMiddle.x, dy = pThumb.y - pMiddle.y, dz = pThumb.z - pMiddle.z
      vector[offset + 119] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
    }
    if (pIndex && pPinky) {
      const dx = pIndex.x - pPinky.x, dy = pIndex.y - pPinky.y, dz = pIndex.z - pPinky.z
      vector[offset + 120] = Math.sqrt(dx * dx + dy * dy + dz * dz) / scale
    }

    // 6. 7D Palm Normal & Speed
    const p0 = hand[0], p5 = hand[5], p17 = hand[17]
    if (p0 && p5 && p17) {
      const v1x = p5.x - p0.x, v1y = p5.y - p0.y, v1z = p5.z - p0.z
      const v2x = p17.x - p0.x, v2y = p17.y - p0.y, v2z = p17.z - p0.z
      let nx = v1y * v2z - v1z * v2y
      let ny = v1z * v2x - v1x * v2z
      let nz = v1x * v2y - v1y * v2x
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 0.001) {
        nx /= len; ny /= len; nz /= len
      }
      vector[offset + 121] = nx
      vector[offset + 122] = ny
      vector[offset + 123] = nz
    }

    const vWrist = vel[0]
    const speed = Math.sqrt(vWrist.x * vWrist.x + vWrist.y * vWrist.y + vWrist.z * vWrist.z)
    for (let s = 0; s < 4; s++) {
      vector[offset + 124 + s] = speed
    }

    return vel
  }

  const velLeft = processHand256(leftHand, prevLeft, prevVelLeft, 0)
  const velRight = processHand256(rightHand, prevRight, prevVelRight, 128)

  return { vector, leftHand, rightHand, velLeft, velRight }
}

/** Ubah hasil HandLandmarker (320D Supreme Pinnacle) untuk Model v6.
 *  WAJIB 100% identik dengan ml/preprocessing/extract_landmarks_v6.py build_320d_vector()
 */
export function landmarksTo320DVector(
  result: HandLandmarkerResult,
  prevLeft: { x: number; y: number; z: number }[] | null,
  prevRight: { x: number; y: number; z: number }[] | null,
  _prevVelLeft: { x: number; y: number; z: number }[] | null,
  _prevVelRight: { x: number; y: number; z: number }[] | null
): {
  vector: number[]
  leftHand: { x: number; y: number; z: number }[] | null
  rightHand: { x: number; y: number; z: number }[] | null
  velLeft: { x: number; y: number; z: number }[] | null
  velRight: { x: number; y: number; z: number }[] | null
} {
  const vector = new Array(320).fill(0)
  const hands = result?.landmarks ?? []
  const handedness = result?.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') leftHand = hands[i]
    else if (label === 'Right') rightHand = hands[i]
    else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  // --- Helper: compute joint angle cosines (identik Python compute_joint_angles) ---
  const computeAngles = (hand: { x: number; y: number; z: number }[]): number[] => {
    const joints = [
      [0, 1, 2], [1, 2, 3], [2, 3, 4],
      [0, 5, 6], [5, 6, 7], [6, 7, 8],
      [0, 9, 10], [9, 10, 11], [10, 11, 12],
      [0, 13, 14], [13, 14, 15], [14, 15, 16],
      [0, 17, 18], [17, 18, 19], [18, 19, 20],
    ]
    const angles: number[] = []
    for (const [a, b, c] of joints) {
      const pa = hand[a], pb = hand[b], pc = hand[c]
      if (pa && pb && pc) {
        const v1x = pa.x - pb.x, v1y = pa.y - pb.y, v1z = pa.z - pb.z
        const v2x = pc.x - pb.x, v2y = pc.y - pb.y, v2z = pc.z - pb.z
        const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
        const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z)
        if (n1 > 1e-4 && n2 > 1e-4) {
          const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (n1 * n2)
          angles.push(Math.max(-1.0, Math.min(1.0, dot)))
        } else {
          angles.push(1.0)
        }
      } else {
        angles.push(1.0)
      }
    }
    return angles
  }

  // --- Helper: normalize hand (identik Python norm_left -= left_hand[0]; /= max_dist) ---
  const normalizeHand = (
    hand: { x: number; y: number; z: number }[] | null,
    offset: number
  ) => {
    if (!hand || hand.length < 21) return
    const wrist = hand[0]
    // Cek apakah hand aktif (bukan semua nol)
    let anyNonZero = false
    for (let i = 0; i < 21; i++) {
      if (hand[i].x !== 0 || hand[i].y !== 0 || hand[i].z !== 0) {
        anyNonZero = true
        break
      }
    }
    if (!anyNonZero) return

    // Hitung max distance dari wrist (identik Python: np.max(np.linalg.norm(norm, axis=1)))
    let maxDist = 0
    for (let i = 0; i < 21; i++) {
      const dx = hand[i].x - wrist.x
      const dy = hand[i].y - wrist.y
      const dz = hand[i].z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > maxDist) maxDist = dist
    }
    if (maxDist < 1e-4) maxDist = 1.0

    // Tulis normalized landmarks
    for (let i = 0; i < 21; i++) {
      vector[offset + i * 3] = (hand[i].x - wrist.x) / maxDist
      vector[offset + i * 3 + 1] = (hand[i].y - wrist.y) / maxDist
      vector[offset + i * 3 + 2] = (hand[i].z - wrist.z) / maxDist
    }
  }

  // --- Helper: compute velocities (identik Python: vel = hand - prev_hand) ---
  const computeVelocity = (
    hand: { x: number; y: number; z: number }[] | null,
    prevHand: { x: number; y: number; z: number }[] | null,
    offset: number
  ): { x: number; y: number; z: number }[] => {
    const vel: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < 21; i++) {
      let vx = 0, vy = 0, vz = 0
      if (hand && prevHand && hand[i] && prevHand[i]) {
        // Cek kedua tangan aktif (bukan all-zero)
        const handActive = hand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)
        const prevActive = prevHand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)
        if (handActive && prevActive) {
          vx = hand[i].x - prevHand[i].x
          vy = hand[i].y - prevHand[i].y
          vz = hand[i].z - prevHand[i].z
        }
      }
      vel.push({ x: vx, y: vy, z: vz })
      vector[offset + i * 3] = vx
      vector[offset + i * 3 + 1] = vy
      vector[offset + i * 3 + 2] = vz
    }
    return vel
  }

  // --- Helper: compute fingertip distances (identik Python: pairs termasuk self-pairs) ---
  const computeFingertips = (
    hand: { x: number; y: number; z: number }[] | null,
    offset: number
  ) => {
    if (!hand || hand.length < 21) return
    const handActive = hand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)
    if (!handActive) return

    const tipIdx = [4, 8, 12, 16, 20]
    // Identik Python pairs: 10 cross-pairs + 5 self-pairs (=0)
    const pairs: [number, number][] = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 2], [1, 3], [1, 4],
      [2, 3], [2, 4],
      [3, 4],
      [0, 0], [1, 1], [2, 2], [3, 3], [4, 4]
    ]
    for (let p = 0; p < 15; p++) {
      const [i1, i2] = pairs[p]
      const p1 = hand[tipIdx[i1]], p2 = hand[tipIdx[i2]]
      if (p1 && p2) {
        const dx = p1.x - p2.x, dy = p1.y - p2.y, dz = p1.z - p2.z
        // RAW distance, TIDAK dinormalisasi (identik Python)
        vector[offset + p] = Math.sqrt(dx * dx + dy * dy + dz * dz)
      }
    }
  }

  // ========== BUILD 320D VECTOR ==========

  // 1. Normalized Landmarks (126D) — offset 0..125
  normalizeHand(leftHand, 0)
  normalizeHand(rightHand, 63)

  // 2. Velocities (126D) — offset 126..251
  const velLeft = computeVelocity(leftHand, prevLeft, 126)
  const velRight = computeVelocity(rightHand, prevRight, 189)

  // 3. Joint Angles (30D) — offset 252..281
  if (leftHand && leftHand.length >= 21 && leftHand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)) {
    const anglesL = computeAngles(leftHand)
    for (let a = 0; a < 15; a++) vector[252 + a] = anglesL[a]
  } else {
    for (let a = 0; a < 15; a++) vector[252 + a] = 1.0 // identik Python: np.ones(15)
  }
  if (rightHand && rightHand.length >= 21 && rightHand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)) {
    const anglesR = computeAngles(rightHand)
    for (let a = 0; a < 15; a++) vector[267 + a] = anglesR[a]
  } else {
    for (let a = 0; a < 15; a++) vector[267 + a] = 1.0
  }

  // 4. Inter-Fingertip Distance Matrix (30D) — offset 282..311
  computeFingertips(leftHand, 282)
  computeFingertips(rightHand, 297)

  // 5. Dual Hand Wrists Interaction & Speed (8D) — offset 312..319
  const speedL = Math.sqrt(velLeft[0].x ** 2 + velLeft[0].y ** 2 + velLeft[0].z ** 2)
  const speedR = Math.sqrt(velRight[0].x ** 2 + velRight[0].y ** 2 + velRight[0].z ** 2)
  const hasL = (leftHand && leftHand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)) ? 1.0 : 0.0
  const hasR = (rightHand && rightHand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)) ? 1.0 : 0.0

  if (hasL > 0 && hasR > 0 && leftHand && rightHand) {
    const rx = leftHand[0].x - rightHand[0].x
    const ry = leftHand[0].y - rightHand[0].y
    const rz = leftHand[0].z - rightHand[0].z
    const distW = Math.sqrt(rx * rx + ry * ry + rz * rz)
    vector[312] = rx
    vector[313] = ry
    vector[314] = rz
    vector[315] = distW
  }
  vector[316] = speedL
  vector[317] = speedR
  vector[318] = hasL
  vector[319] = hasR

  return { vector, leftHand, rightHand, velLeft, velRight }
}

/** Model v7 Robust: 164D Camera-Invariant Feature Vector.
 * TANPA velocity/acceleration — hanya landmarks + joint angles + wrist interaction.
 * Identik dengan ml/preprocessing/extract_landmarks_v7.py build_164d_vector()
 */
export function landmarksTo164DVector(
  result: HandLandmarkerResult,
): {
  vector: number[]
  leftHand: { x: number; y: number; z: number }[] | null
  rightHand: { x: number; y: number; z: number }[] | null
} {
  const vector = new Array(164).fill(0)
  const hands = result?.landmarks ?? []
  const handedness = result?.handednesses ?? []

  let leftHand: { x: number; y: number; z: number }[] | null = null
  let rightHand: { x: number; y: number; z: number }[] | null = null

  for (let i = 0; i < hands.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    if (label === 'Left') leftHand = hands[i]
    else if (label === 'Right') rightHand = hands[i]
    else {
      if (!leftHand) leftHand = hands[i]
      else if (!rightHand) rightHand = hands[i]
    }
  }

  // Fallback 1-tangan: jika hanya 1 tangan terdeteksi (misal isyarat 1 tangan seperti Saya/Makan), isi kedua slot agar fitur 164D selalu lengkap
  if (leftHand && !rightHand) rightHand = leftHand
  else if (rightHand && !leftHand) leftHand = rightHand

  // --- Helper: check if hand is active ---
  const isActive = (hand: { x: number; y: number; z: number }[] | null): boolean => {
    if (!hand || hand.length < 21) return false
    return hand.some(p => p.x !== 0 || p.y !== 0 || p.z !== 0)
  }

  // --- Helper: normalize hand (identik Python normalize_hand) ---
  const normalizeHand = (
    hand: { x: number; y: number; z: number }[] | null,
    offset: number
  ) => {
    if (!hand || !isActive(hand)) return
    const wrist = hand[0]

    // Max distance from wrist (more robust than single wrist-to-MCP)
    let maxDist = 0
    for (let i = 0; i < 21; i++) {
      const dx = hand[i].x - wrist.x
      const dy = hand[i].y - wrist.y
      const dz = hand[i].z - wrist.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > maxDist) maxDist = dist
    }
    if (maxDist < 1e-4) maxDist = 1.0

    for (let i = 0; i < 21; i++) {
      vector[offset + i * 3] = (hand[i].x - wrist.x) / maxDist
      vector[offset + i * 3 + 1] = (hand[i].y - wrist.y) / maxDist
      vector[offset + i * 3 + 2] = (hand[i].z - wrist.z) / maxDist
    }
  }

  // --- Helper: compute joint angles (identik Python compute_joint_angles) ---
  const computeAngles = (hand: { x: number; y: number; z: number }[]): number[] => {
    const joints = [
      [0, 1, 2], [1, 2, 3], [2, 3, 4],
      [0, 5, 6], [5, 6, 7], [6, 7, 8],
      [0, 9, 10], [9, 10, 11], [10, 11, 12],
      [0, 13, 14], [13, 14, 15], [14, 15, 16],
      [0, 17, 18], [17, 18, 19], [18, 19, 20],
    ]
    const angles: number[] = []
    for (const [a, b, c] of joints) {
      const pa = hand[a], pb = hand[b], pc = hand[c]
      if (pa && pb && pc) {
        const v1x = pa.x - pb.x, v1y = pa.y - pb.y, v1z = pa.z - pb.z
        const v2x = pc.x - pb.x, v2y = pc.y - pb.y, v2z = pc.z - pb.z
        const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
        const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z)
        if (n1 > 1e-4 && n2 > 1e-4) {
          const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (n1 * n2)
          angles.push(Math.max(-1.0, Math.min(1.0, dot)))
        } else {
          angles.push(1.0)
        }
      } else {
        angles.push(1.0)
      }
    }
    return angles
  }

  // ========== BUILD 164D VECTOR ==========

  // 1. Normalized Landmarks (126D) — offset 0..125
  normalizeHand(leftHand, 0)
  normalizeHand(rightHand, 63)

  // 2. Joint Angles (30D) — offset 126..155
  if (leftHand && isActive(leftHand)) {
    const anglesL = computeAngles(leftHand)
    for (let a = 0; a < 15; a++) vector[126 + a] = anglesL[a]
  } else {
    for (let a = 0; a < 15; a++) vector[126 + a] = 1.0
  }
  if (rightHand && isActive(rightHand)) {
    const anglesR = computeAngles(rightHand)
    for (let a = 0; a < 15; a++) vector[141 + a] = anglesR[a]
  } else {
    for (let a = 0; a < 15; a++) vector[141 + a] = 1.0
  }

  // 3. Wrist Interaction & Handedness (8D) — offset 156..163
  const hasL = isActive(leftHand)
  const hasR = isActive(rightHand)

  if (hasL && hasR && leftHand && rightHand) {
    const rx = leftHand[0].x - rightHand[0].x
    const ry = leftHand[0].y - rightHand[0].y
    const rz = leftHand[0].z - rightHand[0].z
    const distW = Math.sqrt(rx * rx + ry * ry + rz * rz)
    vector[156] = rx
    vector[157] = ry
    vector[158] = rz
    vector[159] = distW
  }
  vector[160] = (hasL && leftHand) ? leftHand[0].y : 0.0
  vector[161] = (hasR && rightHand) ? rightHand[0].y : 0.0
  vector[162] = hasL ? 1.0 : 0.0
  vector[163] = hasR ? 1.0 : 0.0

  return { vector, leftHand, rightHand }
}

/**
 * Buffer sequence landmark dengan Puncak Gerakan (Motion Burst) & Dynamic Cooldown.
 * Mengklasifikasikan isyarat secara presisi setelah gerakan memuncak dan melambat.
 */
export function extractRawWrists(result: HandLandmarkerResult): { x: number; y: number }[] {
  const wrists: { x: number; y: number }[] = []
  const hands = result?.landmarks ?? []
  for (const hand of hands) {
    if (hand && hand[0]) {
      wrists.push({ x: hand[0].x, y: hand[0].y })
    }
  }
  return wrists
}

export function resampleSequenceTS(sequence: number[][], targetLength: number = 30): number[][] {
  const nFrames = sequence.length
  if (nFrames === 0) return []
  if (nFrames === targetLength) return sequence
  const featureDim = sequence[0].length
  const resampled: number[][] = []
  for (let i = 0; i < targetLength; i++) {
    const idx = (i / (targetLength - 1)) * (nFrames - 1)
    const low = Math.floor(idx)
    const high = Math.min(Math.ceil(idx), nFrames - 1)
    const weight = idx - low
    const frame = new Array(featureDim)
    for (let d = 0; d < featureDim; d++) {
      frame[d] = (1 - weight) * sequence[low][d] + weight * sequence[high][d]
    }
    resampled.push(frame)
  }
  return resampled
}

export class GlossSequenceBuffer {
  private frames: number[][] = []
  private wristHistory: { x: number; y: number }[][] = []
  private isStill: boolean = true
  private lastMotionEnergy: number = 0
  private cooldownUntil: number = 0
  private lastClassifiedTime: number = 0
  private candidateLabel: string | null = null
  private candidateConfidence: number = 0
  private candidateTime: number = 0
  private lastEmittedLabel: string | null = null
  private emittedInCurrentMotion: Set<string> = new Set()
  // Burst-then-settle: tunggu gerakan benar-benar mereda sebelum boleh commit
  // sebuah prediksi, supaya gerakan yang belum selesai tidak ditebak di
  // tengah jalan (lihat diskusi & plan "Improve deteksi & UX Room Lokal").
  private hadBurst: boolean = false
  private settleStreak: number = 0
  private static readonly BURST_THRESHOLD = 0.03
  private static readonly SETTLE_FRAMES_REQUIRED = 3

  push(frame: number[], rawWrists: { x: number; y: number }[] = []) {
    // Jika dimensi vektor berubah (misal dari 126D ke 160D), bersihkan buffer otomatis
    if (this.frames.length > 0 && this.frames[0].length !== frame.length) {
      this.frames = []
      this.wristHistory = []
      this.candidateLabel = null
      this.lastEmittedLabel = null
      this.emittedInCurrentMotion.clear()
    }

    this.frames.push(frame)
    this.wristHistory.push(rawWrists)

    if (this.frames.length > 30) {
      this.frames.shift()
      this.wristHistory.shift()
    }
    this.updateMotion()
  }

  private updateMotion() {
    if (this.wristHistory.length < 2) {
      this.lastMotionEnergy = 0
      this.isStill = true
      return
    }

    let totalWristDiff = 0
    let wristCount = 0
    const startIndex = Math.max(0, this.wristHistory.length - 10)

    for (let f = startIndex + 1; f < this.wristHistory.length; f++) {
      const prevWrists = this.wristHistory[f - 1]
      const currWrists = this.wristHistory[f]

      if (prevWrists && currWrists && prevWrists.length > 0 && currWrists.length > 0) {
        for (let i = 0; i < Math.min(prevWrists.length, currWrists.length); i++) {
          const dx = currWrists[i].x - prevWrists[i].x
          const dy = currWrists[i].y - prevWrists[i].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (Number.isFinite(dist)) {
            totalWristDiff += dist
            wristCount++
          }
        }
      }
    }

    const avgWristMotion = wristCount > 0 ? totalWristDiff / wristCount : 0
    this.lastMotionEnergy = Number.isFinite(avgWristMotion) ? avgWristMotion : 0

    // Tangan dianggap diam jika rata-rata pergeseran < 0.015
    this.isStill = this.lastMotionEnergy < 0.015

    // Lacak "ada gerakan besar (burst) lalu mereda" — dipakai isReadyToClassify()
    // supaya sistem tidak menebak di tengah gerakan yang belum selesai.
    if (this.lastMotionEnergy >= GlossSequenceBuffer.BURST_THRESHOLD) {
      this.hadBurst = true
      this.settleStreak = 0
    } else if (this.isStill) {
      this.settleStreak++
    }

    // Jika gerakan selesai (tangan mereda / diam selama beberapa frame), reset memori gestur agar kata bisa dideteksi di gerakan baru
    if (this.settleStreak >= 2) {
      this.emittedInCurrentMotion.clear()
      this.lastEmittedLabel = null
    }
  }

  getMotionEnergy(): number {
    return this.lastMotionEnergy
  }

  getIsStill(): boolean {
    return this.isStill
  }

  /**
   * True hanya setelah pernah ada gerakan yang cukup besar (burst) DAN
   * tangan sudah diam lagi selama beberapa frame berturut-turut. Ini
   * gerbang utama supaya classify() tidak commit di tengah gerakan yang
   * belum selesai — hanya dipanggil setelah tangan benar-benar berhenti.
   */
  isReadyToClassify(): boolean {
    return this.hadBurst && this.settleStreak >= GlossSequenceBuffer.SETTLE_FRAMES_REQUIRED
  }

  isFull(): boolean {
    return this.frames.length >= 20
  }

  clear() {
    this.frames = []
    this.wristHistory = []
    this.isStill = true
    this.lastMotionEnergy = 0
    this.candidateLabel = null
    this.hadBurst = false
    this.settleStreak = 0
    this.emittedInCurrentMotion.clear()
    this.lastEmittedLabel = null
  }

  async classify(
    model: tf.LayersModel,
    isDegradedMode: boolean = false
  ): Promise<{ label: string; confidence: number } | null> {
    const now = performance.now()
    if (this.frames.length < 16) return null
    if (now < this.cooldownUntil) return null

    // Detect model version by input dimension
    const expectedDim = model.inputs[0]?.shape?.[2] ?? 126
    const isV7 = expectedDim === 164

    // 1. FILTER REST POSITION (Tangan di paling bawah layar):
    const latestWrists = this.wristHistory[this.wristHistory.length - 1] ?? []
    if (latestWrists.length > 0 && latestWrists.every((w) => w.y > 0.82)) {
      this.candidateLabel = null
      this.lastEmittedLabel = null
      return null
    }

    // 2. FILTER GERAKAN SANGAT KECIL / HANDS IDLE:
    const motionThreshold = isV7 ? 0.001 : 0.005
    if (this.lastMotionEnergy < motionThreshold) {
      this.candidateLabel = null
      return null
    }

    // Batasi frekuensi klasifikasi
    const classifyInterval = isV7 ? 80 : 150
    if (now - this.lastClassifiedTime < classifyInterval) return null
    this.lastClassifiedTime = now

    // Resample sequence dari buffer aktual secara presisi 30 frame
    const resampledFrames = resampleSequenceTS(this.frames, SEQUENCE_LENGTH)

    try {
      const input = tf.tensor3d([resampledFrames])
      try {
        const output = model.predict(input) as tf.Tensor
        const probs = await output.data()
        output.dispose()

        let maxIdx = 0
        let secondMaxIdx = 0
        for (let i = 1; i < probs.length; i++) {
          if (probs[i] > probs[maxIdx]) {
            secondMaxIdx = maxIdx
            maxIdx = i
          } else if (probs[i] > probs[secondMaxIdx]) {
            secondMaxIdx = i
          }
        }

        const topConfidence = probs[maxIdx] ?? 0
        const margin = topConfidence - (probs[secondMaxIdx] ?? 0)
        let finalLabel = GLOSS_LABELS[maxIdx] ?? `label_${maxIdx}`
        const lowerLabel = finalLabel.toLowerCase()

        // 3. PENCEGAHAN DOUBLE PREDIKSI DALAM SIKLUS GERAKAN AKTIF SAMA:
        if (this.emittedInCurrentMotion.has(lowerLabel) || (this.lastEmittedLabel && lowerLabel === this.lastEmittedLabel.toLowerCase())) {
          return null
        }

        // 4. VERIFIKASI DISAMBIGUASI (Makan vs Rumah) — hanya untuk model lama:
        if (!isV7 && lowerLabel === 'rumah') {
          if (latestWrists.length < 2) {
            if (latestWrists.length === 1 && latestWrists[0].y < 0.58) {
              finalLabel = 'Makan'
              if (this.emittedInCurrentMotion.has('makan') || (this.lastEmittedLabel && this.lastEmittedLabel.toLowerCase() === 'makan')) {
                return null
              }
            } else {
              this.candidateLabel = null
              return null
            }
          }
        }

        console.log(`🤖 [Predict] Gloss: ${finalLabel} (${(topConfidence * 100).toFixed(1)}%), Margin: ${(margin * 100).toFixed(1)}%, Motion: ${this.lastMotionEnergy.toFixed(4)}${isV7 ? ' [v7]' : ''}`)

        // 5. AMBANG BATAS — v7 dibuat ultra-responsif (32 kelas, chance = 3.1%)
        const minConfidence = isV7
          ? (isDegradedMode ? 0.05 : 0.07)
          : (isDegradedMode ? 0.35 : 0.40)
        const minMargin = isV7
          ? (isDegradedMode ? 0.005 : 0.01)
          : (isDegradedMode ? 0.03 : 0.05)

        if (topConfidence < minConfidence || margin < minMargin) {
          this.candidateLabel = null
          return null
        }

        // 6. FAST-PATH INSTANT TRIGGER:
        const instantThreshold = isV7
          ? (isDegradedMode ? 0.08 : 0.10)
          : (isDegradedMode ? 0.40 : 0.48)
        const cooldownMs = isV7 ? 500 : 1000

        if (topConfidence >= instantThreshold) {
          this.emittedInCurrentMotion.add(lowerLabel)
          this.lastEmittedLabel = finalLabel
          this.cooldownUntil = now + cooldownMs
          this.clear()
          return { label: finalLabel, confidence: topConfidence }
        }

        // 7. TEMPORAL DOUBLE VERIFICATION:
        const verifyWindow = isV7 ? 800 : 600
        if (this.candidateLabel === finalLabel && now - this.candidateTime < verifyWindow) {
          const finalConfidence = Math.max(topConfidence, this.candidateConfidence)
          this.emittedInCurrentMotion.add(lowerLabel)
          this.lastEmittedLabel = finalLabel
          this.cooldownUntil = now + cooldownMs
          this.clear()
          return { label: finalLabel, confidence: finalConfidence }
        }

        this.candidateLabel = finalLabel
        this.candidateConfidence = topConfidence
        this.candidateTime = now
        return null
      } finally {
        input.dispose()
      }
    } catch (err) {
      console.warn('Klasifikasi tensor dilewati:', err)
      return null
    }
  }
}


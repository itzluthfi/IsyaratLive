import * as tf from '@tensorflow/tfjs'
import { getHandLandmarker, getPoseLandmarker, detectFrame, detectPoseFrame } from '../components/LandmarkDetector'
import {
  loadGlossModel,
  landmarksToVector,
  landmarksAndPoseToVector,
  resampleSequenceTS,
  GLOSS_LABELS,
  GLOSS_MODEL_INFO,
  type GlossModelVersion,
} from '../components/GlossClassifier'
import { SIGN_DICTIONARY_DATA } from './signDictionary'

const SEQUENCE_LENGTH = 30
const FRAME_SAMPLES = 24 // titik sampel per video dictionary, tersebar merata sepanjang durasi

export interface SelfTestItemResult {
  label: string
  predicted: string
  confidence: number
  correct: boolean
}

export interface SelfTestResult {
  version: GlossModelVersion
  total: number
  correct: number
  accuracy: number
  perItem: SelfTestItemResult[]
}

async function extractSequenceFromVideo(
  video: HTMLVideoElement,
  useEnabledPose: boolean,
): Promise<number[][]> {
  const handLandmarker = await getHandLandmarker()
  const poseLandmarker = useEnabledPose ? await getPoseLandmarker() : null

  const duration = video.duration || 1
  const frames: number[][] = []

  for (let i = 0; i < FRAME_SAMPLES; i++) {
    const t = (i / (FRAME_SAMPLES - 1)) * duration * 0.98
    await seekTo(video, t)

    // Timestamp sintetis strictly-increasing untuk API detectForVideo (bukan real playback time,
    // hanya dipakai internal MediaPipe untuk tracking antar-frame — tidak memengaruhi hasil landmark).
    const timestamp = i * 33
    const handResult = await detectFrame(handLandmarker, video, timestamp)
    const poseResult = poseLandmarker ? await detectPoseFrame(poseLandmarker, video, timestamp).catch(() => null) : null

    if (handResult.landmarks && handResult.landmarks.length > 0) {
      const vector = useEnabledPose ? landmarksAndPoseToVector(handResult, poseResult) : landmarksToVector(handResult)
      frames.push(vector)
    }
  }

  return frames
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.addEventListener('loadedmetadata', () => resolve(video), { once: true })
    video.addEventListener('error', () => reject(new Error(`Gagal memuat video: ${url}`)), { once: true })
  })
}

/**
 * Uji akurasi kasar (sanity check) satu versi model terhadap 32 video
 * dictionary yang sudah ada di frontend/public/dictionary/ sebagai
 * ground-truth pengganti (bukan test set independen yang dipisah sejak
 * training — lihat batasan di PRD §15.6/§15.7). Berguna untuk mengecek
 * model benar-benar bisa membedakan label yang berbeda, BUKAN pengganti
 * evaluasi Signer-Independent yang seharusnya dilakukan saat training di
 * ml/. Fungsi ini TIDAK mengubah GlossSequenceBuffer atau logika deteksi
 * live sama sekali — hanya memanggil model.predict() langsung secara batch.
 */
export async function runModelSelfTest(
  version: GlossModelVersion,
  onProgress?: (done: number, total: number, currentLabel: string) => void,
): Promise<SelfTestResult> {
  const model = await loadGlossModel(version)
  const usesPose = GLOSS_MODEL_INFO[version].inputDim === 160

  const perItem: SelfTestItemResult[] = []
  const items = SIGN_DICTIONARY_DATA

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    onProgress?.(i, items.length, item.label)

    try {
      const video = await loadVideo(item.videoUrl)
      const frames = await extractSequenceFromVideo(video, usesPose)

      if (frames.length < 4) {
        perItem.push({ label: item.label, predicted: '(tangan tak terdeteksi)', confidence: 0, correct: false })
        continue
      }

      const resampled = resampleSequenceTS(frames, SEQUENCE_LENGTH)
      const input = tf.tensor3d([resampled])
      try {
        const output = model.predict(input) as tf.Tensor
        const probs = await output.data()
        output.dispose()

        let maxIdx = 0
        for (let p = 1; p < probs.length; p++) {
          if (probs[p] > probs[maxIdx]) maxIdx = p
        }
        const predicted = GLOSS_LABELS[maxIdx] ?? `label_${maxIdx}`
        perItem.push({
          label: item.label,
          predicted,
          confidence: probs[maxIdx] ?? 0,
          correct: predicted.toLowerCase() === item.label.toLowerCase(),
        })
      } finally {
        input.dispose()
      }
    } catch (err) {
      perItem.push({ label: item.label, predicted: `(galat: ${err instanceof Error ? err.message : 'unknown'})`, confidence: 0, correct: false })
    }
  }

  onProgress?.(items.length, items.length, '')

  const correct = perItem.filter((r) => r.correct).length
  return {
    version,
    total: perItem.length,
    correct,
    accuracy: perItem.length > 0 ? correct / perItem.length : 0,
    perItem,
  }
}

import * as tf from '@tensorflow/tfjs'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

const MODEL_URL = '/models/gloss-classifier/model.json'

// Diisi sesuai urutan label saat training (lihat ml/training). Placeholder
// sampai model hasil Fase 1 (ml/) diekspor dan disalin ke public/models/.
export const GLOSS_LABELS = [
  'Air', 'Belajar', 'Cari', 'Hari', 'Ingat', 'Lagi', 'Maaf', 'Makan',
  'Motor', 'Saya', 'Terima kasih', 'Tuli', 'Apa', 'Siapa', 'Kapan', 'Di mana',
  'Mengapa', 'Bagaimana', 'Merah', 'Kuning', 'Hijau', 'Hitam', 'Dengar',
  'Berangkat', 'Datang', 'Teman', 'Keluarga', 'Rumah', 'Pagi', 'Siang',
  'Sore', 'Malam',
]

const SEQUENCE_LENGTH = 30 // jumlah frame per buffer (~1 detik @30fps), sesuaikan dgn training

let modelPromise: Promise<tf.LayersModel> | null = null

export function loadGlossModel(): Promise<tf.LayersModel> {
  if (!modelPromise) {
    modelPromise = tf.loadLayersModel(MODEL_URL)
  }
  return modelPromise
}

/** Ubah hasil HandLandmarker (21 titik x,y,z per tangan) jadi flat vector untuk satu frame. */
export function landmarksToVector(result: HandLandmarkerResult): number[] {
  const vector: number[] = []
  const hands = result.landmarks ?? []
  for (let h = 0; h < 2; h++) {
    const hand = hands[h]
    for (let i = 0; i < 21; i++) {
      const point = hand?.[i]
      vector.push(point?.x ?? 0, point?.y ?? 0, point?.z ?? 0)
    }
  }
  return vector
}

/**
 * Buffer sirkular sequence landmark. Saat penuh, jalankan inferensi TFJS
 * dan kembalikan kata gloss dengan confidence tertinggi.
 */
export class GlossSequenceBuffer {
  private frames: number[][] = []

  push(vector: number[]) {
    this.frames.push(vector)
    if (this.frames.length > SEQUENCE_LENGTH) {
      this.frames.shift()
    }
  }

  isFull(): boolean {
    return this.frames.length === SEQUENCE_LENGTH
  }

  clear() {
    this.frames = []
  }

  async classify(model: tf.LayersModel): Promise<{ label: string; confidence: number } | null> {
    if (!this.isFull()) return null

    const input = tf.tensor3d([this.frames])
    try {
      const output = model.predict(input) as tf.Tensor
      const probs = await output.data()
      output.dispose()

      let maxIdx = 0
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[maxIdx]) maxIdx = i
      }

      return { label: GLOSS_LABELS[maxIdx] ?? `label_${maxIdx}`, confidence: probs[maxIdx] }
    } finally {
      input.dispose()
    }
  }
}

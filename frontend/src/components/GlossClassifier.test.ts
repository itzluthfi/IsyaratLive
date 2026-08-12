import { describe, expect, it, beforeEach } from 'vitest'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  landmarksToVector,
  landmarksAndPoseToVector,
  resetLandmarkSmoother,
  resampleSequenceTS,
  GlossSequenceBuffer,
  extractRawWrists,
  GLOSS_LABELS,
  GLOSS_MODEL_VERSIONS,
  GLOSS_MODEL_INFO,
  LATEST_GLOSS_MODEL,
} from './GlossClassifier'

function makeHand(offsetX = 0): { x: number; y: number; z: number }[] {
  // 21 titik landmark palsu tapi berbeda-beda (bukan nol semua) agar deteksi "aktif" jalan.
  return Array.from({ length: 21 }, (_, i) => ({ x: 0.1 + offsetX + i * 0.01, y: 0.2 + i * 0.01, z: 0 }))
}

function makeHandResult(hands: { x: number; y: number; z: number }[][], labels: ('Left' | 'Right')[]): HandLandmarkerResult {
  return {
    landmarks: hands,
    worldLandmarks: hands,
    handednesses: labels.map((name) => [{ categoryName: name, score: 1, index: 0, displayName: name }]),
    handedness: [],
  } as unknown as HandLandmarkerResult
}

describe('GLOSS_LABELS / GLOSS_MODEL_VERSIONS', () => {
  it('has exactly 32 gloss labels matching the WL-BISINDO vocabulary size (PRD §9)', () => {
    expect(GLOSS_LABELS).toHaveLength(32)
  })

  it('exposes all available model versions (v1, v2, v3, v4, v5, v7)', () => {
    expect(GLOSS_MODEL_VERSIONS).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v7'])
    expect(GLOSS_MODEL_VERSIONS).toContain('v7')
  })

  it('defaults the latest model to a version that is actually listed', () => {
    expect(GLOSS_MODEL_VERSIONS).toContain(LATEST_GLOSS_MODEL)
  })

  it('every version has matching metadata', () => {
    for (const v of GLOSS_MODEL_VERSIONS) {
      expect(GLOSS_MODEL_INFO[v].label).toBeTruthy()
      expect(GLOSS_MODEL_INFO[v].inputDim).toBeGreaterThan(0)
    }
  })
})

describe('landmarksToVector', () => {
  beforeEach(() => resetLandmarkSmoother())

  it('returns a 126-dimensional vector (2 tangan x 21 titik x xyz)', () => {
    const result = makeHandResult([makeHand()], ['Right'])
    const vector = landmarksToVector(result)
    expect(vector).toHaveLength(126)
  })

  it('returns all zeros when no hands are detected', () => {
    const result = makeHandResult([], [])
    const vector = landmarksToVector(result)
    expect(vector.every((v) => v === 0)).toBe(true)
  })

  it('fills both left/right slots when only one hand is visible (documented fallback behavior)', () => {
    const result = makeHandResult([makeHand()], ['Left'])
    const vector = landmarksToVector(result)
    const leftSlot = vector.slice(0, 63)
    const rightSlot = vector.slice(63, 126)
    expect(leftSlot).toEqual(rightSlot)
    expect(leftSlot.some((v) => v !== 0)).toBe(true)
  })
})

describe('landmarksAndPoseToVector', () => {
  beforeEach(() => resetLandmarkSmoother())

  it('returns a 160-dimensional vector (Model v3 input shape)', () => {
    const result = makeHandResult([makeHand()], ['Right'])
    const vector = landmarksAndPoseToVector(result, null)
    expect(vector).toHaveLength(160)
  })
})

describe('resampleSequenceTS', () => {
  it('returns the same sequence untouched when already at target length', () => {
    const seq = Array.from({ length: 30 }, (_, i) => [i])
    expect(resampleSequenceTS(seq, 30)).toEqual(seq)
  })

  it('resamples a shorter sequence up to target length via interpolation', () => {
    const seq = [[0], [10]]
    const resampled = resampleSequenceTS(seq, 5)
    expect(resampled).toHaveLength(5)
    expect(resampled[0][0]).toBeCloseTo(0)
    expect(resampled[4][0]).toBeCloseTo(10)
  })

  it('returns empty array for empty input', () => {
    expect(resampleSequenceTS([], 30)).toEqual([])
  })
})

describe('extractRawWrists', () => {
  it('extracts one {x,y} per detected hand from landmark index 0', () => {
    const result = makeHandResult([makeHand(0), makeHand(1)], ['Left', 'Right'])
    const wrists = extractRawWrists(result)
    expect(wrists).toHaveLength(2)
    expect(wrists[0]).toEqual({ x: 0.1, y: 0.2 })
  })
})

describe('GlossSequenceBuffer (state machine, not classify() — that needs a real model)', () => {
  it('is not "full" until at least 20 frames are pushed', () => {
    const buffer = new GlossSequenceBuffer()
    for (let i = 0; i < 19; i++) buffer.push(new Array(126).fill(0))
    expect(buffer.isFull()).toBe(false)
    buffer.push(new Array(126).fill(0))
    expect(buffer.isFull()).toBe(true)
  })

  it('reports isStill=true and zero motion energy before any wrist history is recorded', () => {
    const buffer = new GlossSequenceBuffer()
    expect(buffer.getIsStill()).toBe(true)
    expect(buffer.getMotionEnergy()).toBe(0)
  })

  it('detects motion once wrist positions move between frames', () => {
    const buffer = new GlossSequenceBuffer()
    for (let i = 0; i < 5; i++) {
      buffer.push(new Array(126).fill(0), [{ x: 0.1 * i, y: 0.1 * i }])
    }
    expect(buffer.getMotionEnergy()).toBeGreaterThan(0)
    expect(buffer.getIsStill()).toBe(false)
  })

  it('clear() resets state back to still/empty', () => {
    const buffer = new GlossSequenceBuffer()
    for (let i = 0; i < 5; i++) buffer.push(new Array(126).fill(0), [{ x: 0.1 * i, y: 0 }])
    buffer.clear()
    expect(buffer.isFull()).toBe(false)
    expect(buffer.getIsStill()).toBe(true)
    expect(buffer.getMotionEnergy()).toBe(0)
  })

  it('auto-clears the buffer when the incoming vector dimension changes (e.g. switching model version)', () => {
    const buffer = new GlossSequenceBuffer()
    for (let i = 0; i < 20; i++) buffer.push(new Array(126).fill(0))
    expect(buffer.isFull()).toBe(true)
    buffer.push(new Array(160).fill(0)) // dimensi berubah (mis. ganti ke Model v3)
    expect(buffer.isFull()).toBe(false)
  })
})

describe('GlossSequenceBuffer.isReadyToClassify() — gerbang "tunggu gerakan mereda" (burst-then-settle)', () => {
  it('is never ready without any motion burst, even while nominally "still"', () => {
    const buffer = new GlossSequenceBuffer()
    for (let i = 0; i < 15; i++) buffer.push(new Array(126).fill(0), [{ x: 0, y: 0 }])
    expect(buffer.isReadyToClassify()).toBe(false)
  })

  it('is NOT ready immediately after a big motion burst — must not classify mid-gesture', () => {
    const buffer = new GlossSequenceBuffer()
    buffer.push(new Array(126).fill(0), [{ x: 0, y: 0 }])
    buffer.push(new Array(126).fill(0), [{ x: 5, y: 5 }]) // lompatan besar = burst
    expect(buffer.getIsStill()).toBe(false)
    expect(buffer.isReadyToClassify()).toBe(false)
  })

  it('becomes ready only after the hand settles for a few consecutive still frames following a burst', () => {
    const buffer = new GlossSequenceBuffer()
    buffer.push(new Array(126).fill(0), [{ x: 0, y: 0 }])
    buffer.push(new Array(126).fill(0), [{ x: 5, y: 5 }]) // burst
    expect(buffer.isReadyToClassify()).toBe(false)

    // Tangan berhenti di posisi baru — perlu beberapa frame sampai window
    // rata-rata gerakan tidak lagi didominasi lompatan besar tadi.
    for (let i = 0; i < 20; i++) {
      buffer.push(new Array(126).fill(0), [{ x: 5, y: 5 }])
    }
    expect(buffer.getIsStill()).toBe(true)
    expect(buffer.isReadyToClassify()).toBe(true)
  })

  it('resets after clear() — a new burst+settle cycle is required again', () => {
    const buffer = new GlossSequenceBuffer()
    buffer.push(new Array(126).fill(0), [{ x: 0, y: 0 }])
    buffer.push(new Array(126).fill(0), [{ x: 5, y: 5 }])
    for (let i = 0; i < 20; i++) buffer.push(new Array(126).fill(0), [{ x: 5, y: 5 }])
    expect(buffer.isReadyToClassify()).toBe(true)

    buffer.clear()
    expect(buffer.isReadyToClassify()).toBe(false)
  })
})

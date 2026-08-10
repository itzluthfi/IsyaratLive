import { describe, expect, it } from 'vitest'
import { SIGN_DICTIONARY_DATA, SIGN_DICTIONARY_MAP, parseTextToSignTokens } from './signDictionary'

describe('SIGN_DICTIONARY_DATA', () => {
  it('has exactly 32 entries (sesuai PRD §9)', () => {
    expect(SIGN_DICTIONARY_DATA).toHaveLength(32)
  })

  it('has unique, sequential ids from 0 to 31', () => {
    const ids = SIGN_DICTIONARY_DATA.map((item) => item.id).sort((a, b) => a - b)
    expect(ids).toEqual(Array.from({ length: 32 }, (_, i) => i))
  })

  it('every videoUrl points into /dictionary/ and matches cleanKey', () => {
    for (const item of SIGN_DICTIONARY_DATA) {
      expect(item.videoUrl).toBe(`/dictionary/${item.cleanKey}.mp4`)
    }
  })

  it('every label appears (case-insensitive) in SIGN_DICTIONARY_MAP', () => {
    for (const item of SIGN_DICTIONARY_DATA) {
      expect(SIGN_DICTIONARY_MAP[item.label.toLowerCase()]).toBe(item.videoUrl)
    }
  })
})

describe('parseTextToSignTokens', () => {
  it('returns empty array for blank input', () => {
    expect(parseTextToSignTokens('   ')).toEqual([])
  })

  it('resolves a single known word to its video', () => {
    const tokens = parseTextToSignTokens('makan')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].videoUrl).toBe('/dictionary/makan.mp4')
    expect(tokens[0].labelName).toBe('Makan')
  })

  it('resolves a two-word phrase ("terima kasih") as one token', () => {
    const tokens = parseTextToSignTokens('terima kasih')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].videoUrl).toBe('/dictionary/terima_kasih.mp4')
  })

  it('resolves "di mana" as one token, not two separate words', () => {
    const tokens = parseTextToSignTokens('di mana')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].videoUrl).toBe('/dictionary/di_mana.mp4')
  })

  it('marks unknown words with videoUrl null instead of throwing', () => {
    const tokens = parseTextToSignTokens('halo dunia')
    expect(tokens).toHaveLength(2)
    expect(tokens.every((t) => t.videoUrl === null)).toBe(true)
  })

  it('mixes known and unknown words in one sentence', () => {
    const tokens = parseTextToSignTokens('saya foobar makan')
    expect(tokens.map((t) => t.videoUrl !== null)).toEqual([true, false, true])
  })
})

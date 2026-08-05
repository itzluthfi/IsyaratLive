export interface NormalizeResponse {
  text: string
}

export class NormalizeError extends Error {}

/** POST /api/normalize — kirim gloss mentah, terima kalimat natural dari backend (9Router). */
export async function normalizeGloss(gloss: string[]): Promise<NormalizeResponse> {
  const res = await fetch('/api/normalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gloss }),
  })

  if (!res.ok) {
    throw new NormalizeError(`normalize failed: ${res.status}`)
  }

  return res.json()
}

export interface ConversationMessage {
  id: number
  gloss: string[]
  text: string
  createdAt: string
}

export async function fetchHistory(): Promise<ConversationMessage[]> {
  const res = await fetch('/api/history')
  if (!res.ok) {
    throw new NormalizeError(`fetch history failed: ${res.status}`)
  }
  return res.json()
}

export async function saveHistory(gloss: string[], text: string): Promise<void> {
  await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gloss, text }),
  })
}

const NINEROUTER_URL = process.env.NINEROUTER_URL ?? 'https://9router.example/v1/chat/completions'
const NINEROUTER_API_KEY = process.env.NINEROUTER_API_KEY
const NINEROUTER_MODEL = process.env.NINEROUTER_MODEL ?? 'default'

export class NineRouterError extends Error {}

const SYSTEM_PROMPT = `Kamu menyusun rangkaian kata (gloss) hasil deteksi BISINDO menjadi satu kalimat
Bahasa Indonesia yang natural dan singkat. Gloss tidak mengikuti tata bahasa Indonesia baku
(struktur topic-comment), jadi susun ulang urutan kata bila perlu. Jangan menambah informasi
yang tidak ada di gloss. Balas hanya dengan kalimatnya, tanpa tanda kutip atau penjelasan.`

/** Panggil 9Router (gateway LLM multi-provider) untuk menyusun gloss jadi kalimat natural. */
export async function normalizeGlossToText(gloss: string[]): Promise<string> {
  if (!NINEROUTER_API_KEY) {
    throw new NineRouterError('NINEROUTER_API_KEY belum diset')
  }

  const response = await fetch(NINEROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NINEROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: NINEROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: gloss.join(' ') },
      ],
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new NineRouterError(`9Router merespons ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim()

  if (!text) {
    throw new NineRouterError('9Router tidak mengembalikan teks')
  }

  return text
}

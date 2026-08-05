import { Router } from 'express'
import { normalizeGlossToText, NineRouterError } from '../services/9router.js'

export const normalizeRouter = Router()

normalizeRouter.post('/normalize', async (req, res) => {
  const { gloss } = req.body as { gloss?: unknown }

  if (!Array.isArray(gloss) || gloss.some((g) => typeof g !== 'string') || gloss.length === 0) {
    res.status(400).json({ error: 'gloss harus berupa array string non-kosong' })
    return
  }

  try {
    const text = await normalizeGlossToText(gloss as string[])
    res.json({ text })
  } catch (err) {
    if (err instanceof NineRouterError) {
      res.status(502).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'internal error' })
  }
})

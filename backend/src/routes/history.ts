import { Router } from 'express'
import { pool } from '../db/index.js'

export const historyRouter = Router()

historyRouter.get('/history', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, gloss, text, created_at AS createdAt FROM messages ORDER BY created_at DESC LIMIT 100',
    )
    res.json(rows)
  } catch {
    res.status(500).json({ error: 'gagal mengambil riwayat' })
  }
})

historyRouter.post('/history', async (req, res) => {
  const { gloss, text } = req.body as { gloss?: unknown; text?: unknown }

  if (!Array.isArray(gloss) || typeof text !== 'string') {
    res.status(400).json({ error: 'gloss (array) dan text (string) wajib diisi' })
    return
  }

  try {
    const [conversation] = await pool.query(
      'INSERT INTO conversations () VALUES ()',
    )
    const conversationId = (conversation as { insertId: number }).insertId

    await pool.query('INSERT INTO messages (conversation_id, gloss, text) VALUES (?, ?, ?)', [
      conversationId,
      JSON.stringify(gloss),
      text,
    ])

    res.status(201).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'gagal menyimpan riwayat' })
  }
})

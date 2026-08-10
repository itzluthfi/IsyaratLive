import express from 'express'
import cors from 'cors'
import { normalizeRouter } from './routes/normalize.js'
import { historyRouter } from './routes/history.js'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.use('/api', normalizeRouter)
  app.use('/api', historyRouter)

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  return app
}

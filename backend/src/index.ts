import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { normalizeRouter } from './routes/normalize.js'
import { historyRouter } from './routes/history.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors())
app.use(express.json())

app.use('/api', normalizeRouter)
app.use('/api', historyRouter)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`IsyaratLive backend listening on port ${PORT}`)
})

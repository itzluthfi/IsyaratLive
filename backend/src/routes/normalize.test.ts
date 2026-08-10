import { describe, expect, it, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

describe('POST /api/normalize', () => {
  beforeEach(() => {
    delete process.env.NINEROUTER_API_KEY
  })

  it('rejects a missing gloss field with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/normalize').send({})
    expect(res.status).toBe(400)
  })

  it('rejects a non-array gloss with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/normalize').send({ gloss: 'SAYA MAKAN' })
    expect(res.status).toBe(400)
  })

  it('rejects an empty gloss array with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/normalize').send({ gloss: [] })
    expect(res.status).toBe(400)
  })

  it('rejects a gloss array containing non-strings with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/normalize').send({ gloss: ['SAYA', 42] })
    expect(res.status).toBe(400)
  })

  it('responds 502 (not a crash) when NINEROUTER_API_KEY is unset — this is the degraded-mode trigger the frontend relies on', async () => {
    const app = createApp()
    const res = await request(app).post('/api/normalize').send({ gloss: ['SAYA', 'MAKAN'] })
    expect(res.status).toBe(502)
    expect(res.body.error).toBeTruthy()
  })
})

describe('GET /api/health', () => {
  it('returns ok:true', async () => {
    const app = createApp()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

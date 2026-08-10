import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

describe('POST /api/history', () => {
  it('rejects a missing gloss/text with 400 (does not touch the DB)', async () => {
    const app = createApp()
    const res = await request(app).post('/api/history').send({})
    expect(res.status).toBe(400)
  })

  it('rejects a non-array gloss with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/history').send({ gloss: 'SAYA', text: 'Saya' })
    expect(res.status).toBe(400)
  })

  it('rejects a non-string text with 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/history').send({ gloss: ['SAYA'], text: 42 })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/history', () => {
  it('fails gracefully (500, not a crash) when MySQL is unreachable in this test environment', async () => {
    const app = createApp()
    const res = await request(app).get('/api/history')
    expect(res.status).toBe(500)
    expect(res.body.error).toBeTruthy()
  })
})

import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'

export const licenseRouter = Router()

licenseRouter.get('/license', (_req, res) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'LICENSE'),
    path.resolve(process.cwd(), '../LICENSE'),
  ]

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      res.type('text/plain').send(content)
      return
    }
  }

  res.status(404).send('LICENSE file not found.')
})

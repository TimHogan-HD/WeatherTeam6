import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp } from '../src/index.js'

const app = createApp()

export default function handler(req: VercelRequest, res: VercelResponse): void {
  app(req, res)
}

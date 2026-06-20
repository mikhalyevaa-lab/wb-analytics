import { NextRequest, NextResponse } from 'next/server'
import { setWebhook } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const result = await setWebhook(`${url}/api/telegram`)
  return NextResponse.json(result)
}

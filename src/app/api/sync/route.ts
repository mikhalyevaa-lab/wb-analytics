/**
 * WB Analytics — API Route для синхронизации
 * Вызывается Vercel Cron каждые 30 минут
 *
 * GET /api/sync — запустить синхронизацию
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncAllStores } from '@/lib/sync'

// Защита от несанкционированных вызовов
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Проверяем секрет (Vercel передаёт его автоматически для Cron)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await syncAllStores()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { recalcAllStoresAggregates, syncAllStores } from '@/lib/sync'

export const maxDuration = 300

// Ночной cron 3:00 UTC — синхронизация + пересчёт агрегатов
// Vercel Cron: schedule "0 3 * * *"
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[nightly] синхронизация данных (включая воронку)')
  await syncAllStores()

  console.log('[nightly] пересчёт агрегатов')
  await recalcAllStoresAggregates()

  console.log('[nightly] завершено')
  return NextResponse.json({ ok: true })
}

// @ts-nocheck
function toDateStr(d: Date) { return d.toISOString().split("T")[0] }
import { adminDb } from '@/lib/db-compat'
/**
 * POST /api/sync/funnel-initial
 * Начальная загрузка воронки продаж за исторический период.
 *
 * Body: { storeId: string, startDate?: string, endDate?: string }
 * По умолчанию startDate = 365 дней назад, endDate = вчера.
 *
 * Требует CRON_SECRET в заголовке Authorization.
 * Важно: может работать долго (зависит от кол-ва артикулов и периода).
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncFunnelPeriod } from '@/lib/sync'
import { requireAuth } from '@/lib/auth-server'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!isCron) {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { storeId?: string; startDate?: string; endDate?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const maxStart = new Date(now)
  maxStart.setDate(maxStart.getDate() - 365)

  const endDate   = body.endDate   ?? toDateStr(yesterday)
  const startDate = body.startDate ?? toDateStr(maxStart)

  // Если storeId не задан — грузим все магазины
  let storeIds: string[]
  if (body.storeId) {
    storeIds = [body.storeId]
  } else {
    const db = adminDb()
    const { data } = await adminDb().from('stores').select('id')
    storeIds = (data ?? []).map(r => r.id as string)
  }

  if (!storeIds.length) {
    return NextResponse.json({ error: 'No stores found' }, { status: 404 })
  }

  const summary: Record<string, { count: number; days: number }> = {}
  const db = adminDb()

  for (const storeId of storeIds) {
    const t0 = Date.now()
    let logError: string | null = null
    let count = 0
    try {
      console.log(`[funnel-initial] store=${storeId} ${startDate}—${endDate}`)
      const result = await syncFunnelPeriod(storeId, startDate, endDate)
      summary[storeId] = result
      count = result.count
      console.log(`[funnel-initial] store=${storeId}: ${result.count} строк за ${result.days} дней`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[funnel-initial] store=${storeId} error:`, msg)
      logError = msg
      summary[storeId] = { count: -1, days: 0 }
    }

    await db.from('sync_log').insert({
      store_id:    storeId,
      method:      'funnel',
      date_from:   startDate,
      date_to:     endDate,
      rows_count:  count,
      status:      logError ? 'error' : 'ok',
      error:       logError,
      duration_ms: Date.now() - t0,
    })
  }

  return NextResponse.json({ ok: true, period: { startDate, endDate }, summary })
}

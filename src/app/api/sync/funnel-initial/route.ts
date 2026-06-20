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
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function toDateStr(date: Date) {
  return date.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const db = adminClient()
    const { data } = await db.from('stores').select('id')
    storeIds = (data ?? []).map(r => r.id as string)
  }

  if (!storeIds.length) {
    return NextResponse.json({ error: 'No stores found' }, { status: 404 })
  }

  const summary: Record<string, { count: number; days: number }> = {}

  for (const storeId of storeIds) {
    try {
      console.log(`[funnel-initial] store=${storeId} ${startDate}—${endDate}`)
      const result = await syncFunnelPeriod(storeId, startDate, endDate)
      summary[storeId] = result
      console.log(`[funnel-initial] store=${storeId}: ${result.count} строк за ${result.days} дней`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[funnel-initial] store=${storeId} error:`, msg)
      summary[storeId] = { count: -1, days: 0 }
    }
  }

  return NextResponse.json({ ok: true, period: { startDate, endDate }, summary })
}

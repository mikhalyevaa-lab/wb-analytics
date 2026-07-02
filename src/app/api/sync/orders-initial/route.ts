// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
/**
 * POST /api/sync/orders-initial
 * Начальная/догрузка исторических заказов.
 * Использует WB API flag=1 (по дате заказа, не изменения).
 *
 * Body: { storeId?: string, dateFrom?: string }
 * dateFrom по умолчанию = 365 дней назад.
 *
 * WB API возвращает ВСЕ заказы одним ответом — для 365 дней это ~50-150k строк.
 * Vercel timeout = 300s для Pro, используйте только из curl/postman при необходимости.
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncOrdersPeriod } from '@/lib/sync'
import { requireAuth } from '@/lib/auth-server'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!isCron) {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { storeId?: string; dateFrom?: string } = {}
  try { body = await req.json() } catch { /* empty body OK */ }

  const dateFrom = body.dateFrom
    ?? new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]

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

  const summary: Record<string, { inserted: number; skipped: number }> = {}
  for (const storeId of storeIds) {
    try {
      console.log(`[orders-initial] store=${storeId} from=${dateFrom}`)
      const result = await syncOrdersPeriod(storeId, dateFrom)
      summary[storeId] = result
      console.log(`[orders-initial] store=${storeId}: inserted=${result.inserted}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[orders-initial] store=${storeId} error:`, msg)
      summary[storeId] = { inserted: -1, skipped: 0 }
    }
  }

  return NextResponse.json({ ok: true, dateFrom, summary })
}

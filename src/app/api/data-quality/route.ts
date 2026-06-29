import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

// Thresholds: how many hours until a source is considered stale
const STALE_AFTER: Record<string, number> = {
  orders:      3,
  sales:       3,
  finance:     25,
  stocks:      13,
  storage:     25,
  tariffs:     25,
  commissions: 250,
  funnel:      25,
  products:    25,
  advertising: 25,
}

const LABELS: Record<string, string> = {
  orders:      'Заказы',
  sales:       'Продажи',
  finance:     'Финансы WB',
  stocks:      'Остатки',
  storage:     'Хранение',
  tariffs:     'Тарифы',
  commissions: 'Комиссии',
  funnel:      'Воронка',
  products:    'Товары',
  advertising: 'Реклама',
}

export interface DataQualityItem {
  method:    string
  label:     string
  lastRun:   string | null // ISO string
  lastOk:    string | null // ISO string of last successful run
  lastRows:  number | null
  lastStatus: string | null
  status:    'ok' | 'stale' | 'error' | 'never' | 'syncing'
  hoursAgo:  number | null
}

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ items: [] })

  const adb = adminDb()

  // Реклама не пишет в sync_log — берём статус напрямую из wb_ad_spend
  const { db } = await import('@/lib/db')
  const adRows = await db<{ max_date: string | null; cnt: number }[]>`
    SELECT MAX(date)::text AS max_date, COUNT(*)::int AS cnt
    FROM wb_ad_spend WHERE store_id = ANY(${storeIds})
  `
  const adMaxDate = adRows[0]?.max_date ?? null
  const adCount   = Number(adRows[0]?.cnt ?? 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logs } = await (adb.from('sync_log') as any)
    .select('method,status,rows_count,created_at')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (logs ?? []) as { method: string; status: string; rows_count: number; created_at: string }[]

  // lastRun = самая свежая запись; lastCompleted = последняя не-running запись
  const byMethod: Record<string, {
    lastRun: string; lastRows: number; lastStatus: string; lastOk: string | null
    lastCompletedStatus: string | null; lastCompletedAt: string | null; lastCompletedRows: number | null
  }> = {}
  for (const r of rows) {
    if (!byMethod[r.method]) {
      byMethod[r.method] = {
        lastRun: r.created_at, lastRows: r.rows_count, lastStatus: r.status, lastOk: null,
        lastCompletedStatus: null, lastCompletedAt: null, lastCompletedRows: null,
      }
    }
    const info = byMethod[r.method]
    if (info.lastCompletedStatus === null && r.status !== 'running') {
      info.lastCompletedStatus = r.status
      info.lastCompletedAt    = r.created_at
      info.lastCompletedRows  = r.rows_count
    }
    if (!info.lastOk && (r.status === 'ok' || r.status === 'done')) {
      info.lastOk = r.created_at
    }
  }

  const now = Date.now()
  const methods = Object.keys(LABELS)

  const items: DataQualityItem[] = methods.map(method => {
    // Реклама — собственный источник статуса
    if (method === 'advertising') {
      if (!adMaxDate) {
        return { method, label: LABELS[method], lastRun: null, lastOk: null, lastRows: null, lastStatus: null, status: 'never', hoursAgo: null }
      }
      // hoursAgo считаем от конца последнего дня с данными (midnight следующего дня)
      const lastDayEnd = new Date(adMaxDate)
      lastDayEnd.setDate(lastDayEnd.getDate() + 1)
      const hoursAgo = Math.round((now - lastDayEnd.getTime()) / 3600000 * 10) / 10
      const threshold = STALE_AFTER['advertising']!
      const status: DataQualityItem['status'] = hoursAgo > threshold ? 'stale' : 'ok'
      return {
        method,
        label: LABELS[method],
        lastRun: lastDayEnd.toISOString(),
        lastOk:  lastDayEnd.toISOString(),
        lastRows: adCount,
        lastStatus: 'ok',
        status,
        hoursAgo,
      }
    }

    const info = byMethod[method]
    if (!info) return { method, label: LABELS[method], lastRun: null, lastOk: null, lastRows: null, lastStatus: null, status: 'never', hoursAgo: null }

    const hoursAgo = Math.round((now - new Date(info.lastRun).getTime()) / 3600000 * 10) / 10
    const threshold = STALE_AFTER[method] ?? 25

    // Если последняя запись 'running' — синк сейчас идёт или завис
    if (info.lastStatus === 'running') {
      const runningMinutes = Math.round((now - new Date(info.lastRun).getTime()) / 60000)
      if (runningMinutes < 30) {
        // Свежий 'running' — синк в процессе
        return { method, label: LABELS[method], lastRun: info.lastRun, lastOk: info.lastOk, lastRows: info.lastRows, lastStatus: 'running', status: 'syncing', hoursAgo: null }
      }
      // Старый 'running' (завис) — смотрим на последнюю завершённую запись
      const compStatus = info.lastCompletedStatus
      const compAt     = info.lastCompletedAt
      const compHours  = compAt ? Math.round((now - new Date(compAt).getTime()) / 3600000 * 10) / 10 : null
      const isCompOk   = compStatus === 'ok' || compStatus === 'done'
      let status: DataQualityItem['status'] = isCompOk ? (compHours != null && compHours > threshold ? 'stale' : 'ok') : 'error'
      if (!compStatus) status = 'error'
      return { method, label: LABELS[method], lastRun: info.lastRun, lastOk: info.lastOk, lastRows: info.lastCompletedRows, lastStatus: compStatus ?? 'running', status, hoursAgo: compHours }
    }

    const isOk = info.lastStatus === 'ok' || info.lastStatus === 'done'
    let status: DataQualityItem['status'] = 'ok'
    if (!isOk) status = 'error'
    else if (hoursAgo > threshold) status = 'stale'

    return {
      method,
      label: LABELS[method],
      lastRun: info.lastRun,
      lastOk: info.lastOk,
      lastRows: info.lastRows,
      lastStatus: info.lastStatus,
      status,
      hoursAgo,
    }
  })

  return NextResponse.json({ items })
}

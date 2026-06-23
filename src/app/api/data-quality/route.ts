import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { adminDb } from '@/lib/admin'
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
}

export interface DataQualityItem {
  method:    string
  label:     string
  lastRun:   string | null // ISO string
  lastOk:    string | null // ISO string of last successful run
  lastRows:  number | null
  lastStatus: string | null
  status:    'ok' | 'stale' | 'error' | 'never'
  hoursAgo:  number | null
}

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ items: [] })

  const adb = adminDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logs } = await (adb.from('sync_log') as any)
    .select('method,status,rows_count,created_at')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (logs ?? []) as { method: string; status: string; rows_count: number; created_at: string }[]

  const byMethod: Record<string, { lastRun: string; lastOk: string | null; lastRows: number; lastStatus: string }> = {}
  for (const r of rows) {
    if (!byMethod[r.method]) {
      byMethod[r.method] = { lastRun: r.created_at, lastRows: r.rows_count, lastStatus: r.status, lastOk: null }
    }
    if (!byMethod[r.method].lastOk && (r.status === 'ok' || r.status === 'done')) {
      byMethod[r.method].lastOk = r.created_at
    }
  }

  const now = Date.now()
  const methods = Object.keys(LABELS)

  const items: DataQualityItem[] = methods.map(method => {
    const info = byMethod[method]
    if (!info) return { method, label: LABELS[method], lastRun: null, lastOk: null, lastRows: null, lastStatus: null, status: 'never', hoursAgo: null }

    const hoursAgo = Math.round((now - new Date(info.lastRun).getTime()) / 3600000 * 10) / 10
    const threshold = STALE_AFTER[method] ?? 25
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

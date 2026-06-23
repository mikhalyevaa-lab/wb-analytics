import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'
import { syncPaidStoragePeriod } from '@/lib/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/admin/storage-load
// Body: { months?: number, dateFrom?: string, dateTo?: string }
// Загружает один период (один чанк ≤31 день) — вызывается последовательно из клиента.
// Для полной истории клиент сам обходит месяцы и вызывает endpoint per-month.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adb = adminDb()
  const { data: storesRaw } = await (adb.from('stores') as any)
    .select('id, name, wb_analytics_token')
    .not('wb_analytics_token', 'is', null)
    .limit(50)

  const stores = (storesRaw ?? []) as { id: string; name: string }[]
  if (!stores.length) return NextResponse.json({ ok: false, error: 'no stores with analytics token' })

  const body = await req.json().catch(() => ({}))

  // Либо явные даты, либо вычисляем по months
  let dateFrom: string
  let dateTo: string
  if (body.dateFrom && body.dateTo) {
    dateFrom = body.dateFrom
    dateTo   = body.dateTo
  } else {
    const monthOffset = Number(body.monthOffset ?? 0) // 0 = текущий, 1 = прошлый и т.д.
    const today = new Date()
    const from = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1)
    const to   = new Date(today.getFullYear(), today.getMonth() - monthOffset + 1, 0)
    dateFrom = from.toISOString().split('T')[0]
    dateTo   = to > today ? today.toISOString().split('T')[0] : to.toISOString().split('T')[0]
  }

  console.log(`[admin/storage-load] период ${dateFrom} → ${dateTo}`)

  const results: Record<string, { inserted: number; error?: string }> = {}
  for (const store of stores) {
    try {
      const { inserted } = await syncPaidStoragePeriod(store.id, dateFrom, dateTo)
      results[store.name] = { inserted }
      console.log(`[admin/storage-load] ${store.name}: ${inserted} строк`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results[store.name] = { inserted: 0, error: msg }
      console.error(`[admin/storage-load] ${store.name}:`, msg)
    }
  }

  const total = Object.values(results).reduce((s, r) => s + r.inserted, 0)
  return NextResponse.json({ ok: true, dateFrom, dateTo, total, results })
}

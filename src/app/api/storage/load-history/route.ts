import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { syncPaidStoragePeriod } from '@/lib/sync'

export const dynamic = 'force-dynamic'

// POST /api/storage/load-history
// Body: { months?: number } — сколько месяцев истории загружать (default 12)
export async function POST(req: Request) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const body = await req.json().catch(() => ({}))

  let dateFrom: string, dateTo: string
  if (body.dateFrom && body.dateTo) {
    dateFrom = body.dateFrom
    dateTo   = body.dateTo
  } else {
    const months = Math.min(Number(body.months ?? 12), 24)
    const today = new Date()
    dateTo   = today.toISOString().split('T')[0]
    dateFrom = new Date(today.getFullYear(), today.getMonth() - months, 1)
      .toISOString().split('T')[0]
  }

  let total = 0
  const errors: string[] = []
  for (const storeId of storeIds) {
    try {
      const { inserted } = await syncPaidStoragePeriod(storeId, dateFrom, dateTo)
      total += inserted
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return NextResponse.json({ ok: true, inserted: total, dateFrom, dateTo, errors })
}

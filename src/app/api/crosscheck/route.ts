import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface CrossCheckData {
  storageApiCost:  number   // Хранение по API (wb_storage_daily)
  salesCount:      number   // Выкупы по wb_sales
  salesRevenue:    number   // Сумма выкупов (for_pay)
}

export async function GET(req: Request) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const [storageCostRow, salesRow] = await Promise.all([
    db<{ total: number }[]>`
      SELECT COALESCE(SUM(cost), 0) total
      FROM wb_storage_daily
      WHERE store_id = ANY(${storeIds}) AND date >= ${from}::date AND date <= ${to}::date`,
    db<{ cnt: number; revenue: number }[]>`
      SELECT COUNT(*) cnt, COALESCE(SUM(for_pay), 0) revenue
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= ${from}::date AND date <= ${to}::date`,
  ])

  return NextResponse.json({
    storageApiCost: Math.round(Number(storageCostRow[0]?.total ?? 0)),
    salesCount:     Number(salesRow[0]?.cnt ?? 0),
    salesRevenue:   Math.round(Number(salesRow[0]?.revenue ?? 0)),
  } satisfies CrossCheckData)
}

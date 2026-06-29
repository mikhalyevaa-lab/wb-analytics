export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export interface HeatDay {
  date: string   // YYYY-MM-DD
  revenue: number
  sales: number
}

export async function GET() {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(session.user.id)
  if (!storeIds.length) return NextResponse.json([])

  const rows = await db<{ date: string; revenue: number; sales: number }[]>`
    SELECT
      "date"::text AS date,
      COALESCE(SUM(for_pay), 0)::float AS revenue,
      COUNT(*) AS sales
    FROM wb_sales
    WHERE store_id = ANY(${storeIds})
      AND "date" >= NOW() - INTERVAL '84 days'
      AND for_pay > 0
    GROUP BY 1
    ORDER BY 1
  `

  return NextResponse.json(rows.map(r => ({
    date: r.date,
    revenue: Number(r.revenue),
    sales: Number(r.sales),
  })))
}

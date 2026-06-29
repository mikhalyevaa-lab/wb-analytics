export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export interface VelocityItem {
  nm_id: number
  article: string
  subject: string
  quantity: number         // текущий остаток
  sales_per_day: number    // продаж/день за 30 дней
  days_left: number | null // дней до нуля
}

export async function GET() {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(session.user.id)
  if (!storeIds.length) return NextResponse.json([])

  const rows = await db<{
    nm_id: number
    supplier_article: string
    subject: string
    quantity: number
    sales_per_day: number
  }[]>`
    WITH latest AS (
      SELECT MAX("date") AS d FROM wb_stocks WHERE store_id=ANY(${storeIds})
    ), stocks AS (
      SELECT s.nm_id, s.supplier_article, s.subject,
             SUM(s.quantity) AS quantity
      FROM wb_stocks s, latest
      WHERE s.store_id=ANY(${storeIds}) AND s."date"=latest.d
      GROUP BY 1, 2, 3
    ), rates AS (
      SELECT nm_id,
             COUNT(*)::float / 30 AS sales_per_day
      FROM wb_sales
      WHERE store_id=ANY(${storeIds})
        AND "date" >= NOW() - INTERVAL '30 days'
        AND for_pay > 0
      GROUP BY 1
    )
    SELECT st.nm_id,
           COALESCE(st.supplier_article, '') AS supplier_article,
           COALESCE(st.subject, '') AS subject,
           st.quantity::int AS quantity,
           COALESCE(r.sales_per_day, 0)::float AS sales_per_day
    FROM stocks st
    LEFT JOIN rates r USING(nm_id)
    WHERE st.quantity > 0 OR r.sales_per_day > 0
    ORDER BY st.nm_id
    LIMIT 500
  `

  const items: VelocityItem[] = rows.map(r => ({
    nm_id: Number(r.nm_id),
    article: r.supplier_article,
    subject: r.subject,
    quantity: Number(r.quantity),
    sales_per_day: Number(r.sales_per_day),
    days_left: r.sales_per_day > 0 ? Math.round(Number(r.quantity) / Number(r.sales_per_day)) : null,
  }))

  return NextResponse.json(items)
}

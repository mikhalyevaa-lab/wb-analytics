import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  // Возвраты = is_realization=true AND for_pay < 0
  // Выкупы  = is_realization=true AND for_pay > 0
  const [totals, skuLowBuyout] = await Promise.all([
    db<{
      sales_28d: number
      returns_28d: number
      returns_sum: number
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales_28d,
        COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns_28d,
        COALESCE(ABS(SUM(for_pay) FILTER (WHERE for_pay < 0)), 0) AS returns_sum
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= NOW() - INTERVAL '28 days'
    `,

    // SKU с % выкупа < 40% (хотя бы 5 продаж для статистики)
    db<{ cnt: number }[]>`
      SELECT COUNT(*) AS cnt FROM (
        SELECT nm_id
        FROM wb_sales
        WHERE store_id = ANY(${storeIds})
          AND is_realization = true
          AND date >= NOW() - INTERVAL '28 days'
        GROUP BY nm_id
        HAVING
          COUNT(*) FILTER (WHERE for_pay > 0) >= 5
          AND COUNT(*) FILTER (WHERE for_pay < 0)::numeric
            / NULLIF(COUNT(*) FILTER (WHERE for_pay > 0), 0) > 0.667
      ) sub
    `,
  ])

  const row = totals[0]
  const sales    = Number(row.sales_28d    ?? 0)
  const returns  = Number(row.returns_28d  ?? 0)
  const total    = sales + returns
  // % выкупа = выкупы / (выкупы + возвраты)
  const buyout_rate = total > 0 ? Math.round(sales / total * 1000) / 10 : null
  const low_buyout_sku_count = Number(skuLowBuyout[0]?.cnt ?? 0)

  return NextResponse.json({
    returns_28d:          returns,
    sales_28d:            sales,
    returns_sum:          Math.round(Number(row.returns_sum ?? 0)),
    buyout_rate,
    low_buyout_sku_count,
    // Данные за 28 дней — оперативные, считаются предварительными
    is_preliminary: true,
    data_timestamp: new Date().toISOString(),
  })
}

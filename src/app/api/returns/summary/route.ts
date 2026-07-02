import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  const { searchParams } = new URL(req.url)

  function moscowDateStr(offsetDays = 0) {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
    d.setUTCDate(d.getUTCDate() - offsetDays)
    return d.toISOString().split('T')[0]
  }

  const from = searchParams.get('from') ?? moscowDateStr(30)
  const to   = searchParams.get('to')   ?? moscowDateStr(0)

  const fromTs       = from + 'T00:00:00.000Z'
  const toTs         = to   + 'T23:59:59.999Z'
  const year2026From = '2026-01-01T00:00:00.000Z'
  const year2026To   = moscowDateStr(0) + 'T23:59:59.999Z'

  const days = Math.round(
    (new Date(toTs).getTime() - new Date(fromTs).getTime()) / (1000 * 60 * 60 * 24)
  )

  const [totals, benchmarkRow] = await Promise.all([
    // Итоговые числа за выбранный период
    db<{ sales_nd: number; returns_nd: number; returns_sum: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE for_pay > 0)::int  AS sales_nd,
        COUNT(*) FILTER (WHERE for_pay < 0)::int  AS returns_nd,
        COALESCE(ABS(SUM(for_pay) FILTER (WHERE for_pay < 0)), 0) AS returns_sum
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
    `,

    // Среднее 2026 (бенчмарк) + кол-во SKU периода выше этого среднего
    db<{ avg_2026: number; above_avg_count: number }[]>`
      WITH skus_2026 AS (
        SELECT nm_id,
          COUNT(*) FILTER (WHERE for_pay < 0)::numeric
            / NULLIF(COUNT(*)::numeric, 0) AS rate
        FROM wb_sales
        WHERE store_id = ANY(${storeIds})
          AND is_realization = true
          AND date >= ${year2026From}::timestamptz
          AND date <= ${year2026To}::timestamptz
        GROUP BY nm_id
        HAVING COUNT(*) >= 3
      ),
      bench AS (
        SELECT COALESCE(AVG(rate), 0) AS avg_rate FROM skus_2026
      ),
      skus_period AS (
        SELECT nm_id,
          COUNT(*) FILTER (WHERE for_pay < 0)::numeric
            / NULLIF(COUNT(*)::numeric, 0) AS rate
        FROM wb_sales
        WHERE store_id = ANY(${storeIds})
          AND is_realization = true
          AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
        GROUP BY nm_id
        HAVING COUNT(*) >= 3
      )
      SELECT
        ROUND((SELECT avg_rate FROM bench) * 100, 1)                              AS avg_2026,
        COUNT(*) FILTER (WHERE rate > (SELECT avg_rate FROM bench))::int          AS above_avg_count
      FROM skus_period
    `,
  ])

  const row     = totals[0]
  const sales   = Number(row?.sales_nd   ?? 0)
  const returns = Number(row?.returns_nd ?? 0)
  const total   = sales + returns
  const return_rate = total > 0 ? Math.round(returns / total * 1000) / 10 : null

  const bench = benchmarkRow[0]

  return NextResponse.json({
    days,
    returns_nd:          returns,
    sales_nd:            sales,
    returns_sum:         Math.round(Number(row?.returns_sum ?? 0)),
    return_rate,
    above_avg_sku_count: Number(bench?.above_avg_count ?? 0),
    avg_return_rate:     Number(bench?.avg_2026        ?? 0),
    is_preliminary:      true,
  })
}

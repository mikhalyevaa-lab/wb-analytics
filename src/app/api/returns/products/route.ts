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
  const limit     = Math.min(200, Number(searchParams.get('limit') ?? 50))
  const offset    = Number(searchParams.get('offset') ?? 0)
  const minSales  = Number(searchParams.get('min_sales') ?? 3)
  // sort: 'returns' (по кол-ву возвратов) | 'return_rate' (по % возврата)
  const sort      = searchParams.get('sort') ?? 'returns'
  // filter: 'above_avg' (выше среднего) | 'none' (без фильтра, для радара)
  const filterMode = searchParams.get('filter') ?? 'none'

  // Принимаем from/to как YYYY-MM-DD; дефолт — последние 30 дней (московское время)
  function moscowDateStr(offsetDays = 0) {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
    d.setUTCDate(d.getUTCDate() - offsetDays)
    return d.toISOString().split('T')[0]
  }

  const from = searchParams.get('from') ?? moscowDateStr(30)
  const to   = searchParams.get('to')   ?? moscowDateStr(0)

  // ISO-строки: PostgreSQL сам приведёт их к timestamptz при сравнении
  const fromTs = from + 'T00:00:00.000Z'
  const toTs   = to   + 'T23:59:59.999Z'
  const days = Math.round(
    (new Date(toTs).getTime() - new Date(fromTs).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Средний % возврата по кабинету (нужен только для режима above_avg)
  let avgReturnRate = 0
  if (filterMode === 'above_avg') {
    const avgRow = await db<{ avg: number }[]>`
      SELECT COALESCE(AVG(returns::numeric / NULLIF(total, 0)), 0) AS avg
      FROM (
        SELECT
          COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
          COUNT(*)::int                             AS total
        FROM wb_sales
        WHERE store_id = ANY(${storeIds})
          AND is_realization = true
          AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
        GROUP BY nm_id
        HAVING COUNT(*) >= ${minSales}
      ) sub
    `
    avgReturnRate = Number(avgRow[0]?.avg ?? 0)
  }

  const rows = await db<{
    nm_id: number
    supplier_article: string | null
    sales: number
    returns: number
    return_rate: number
    net_revenue: number
    returns_sum: number
  }[]>`
    SELECT
      nm_id,
      MAX(supplier_article) AS supplier_article,
      COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
      COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
      ROUND(
        COUNT(*) FILTER (WHERE for_pay < 0)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      ) AS return_rate,
      ROUND(SUM(for_pay)::numeric, 0)                                        AS net_revenue,
      ROUND(ABS(SUM(for_pay) FILTER (WHERE for_pay < 0))::numeric, 0)       AS returns_sum
    FROM wb_sales
    WHERE store_id = ANY(${storeIds})
      AND is_realization = true
      AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
    GROUP BY nm_id
    HAVING
      COUNT(*) >= ${minSales}
      ${filterMode === 'above_avg'
        ? db`AND COUNT(*) FILTER (WHERE for_pay < 0)::numeric / NULLIF(COUNT(*), 0) > ${avgReturnRate}`
        : db``}
    ORDER BY ${sort === 'return_rate' ? db`return_rate DESC` : db`returns DESC`}
    LIMIT ${limit} OFFSET ${offset}
  `

  const countRow = await db<{ total: number }[]>`
    SELECT COUNT(*) AS total FROM (
      SELECT nm_id
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
      GROUP BY nm_id
      HAVING
        COUNT(*) >= ${minSales}
        ${filterMode === 'above_avg'
          ? db`AND COUNT(*) FILTER (WHERE for_pay < 0)::numeric / NULLIF(COUNT(*), 0) > ${avgReturnRate}`
          : db``}
    ) sub
  `

  const nmIds = rows.map(r => r.nm_id)
  const products = nmIds.length
    ? await db<{ nm_id: number; title: string | null; photo_url: string | null }[]>`
        SELECT nm_id, title, photo_url FROM products
        WHERE store_id = ANY(${storeIds}) AND nm_id = ANY(${nmIds})
      `
    : []
  const prodMap = new Map(products.map(p => [p.nm_id, p]))

  const items = rows.map(r => ({
    nm_id:       Number(r.nm_id),
    article:     r.supplier_article ?? String(r.nm_id),
    title:       prodMap.get(Number(r.nm_id))?.title ?? null,
    photo_url:   prodMap.get(Number(r.nm_id))?.photo_url ?? null,
    sales_nd:    Number(r.sales),
    returns_nd:  Number(r.returns),
    return_rate: Number(r.return_rate),
    net_revenue: Number(r.net_revenue),
    returns_sum: Number(r.returns_sum),
  }))

  return NextResponse.json({
    items,
    total:          Number(countRow[0]?.total ?? 0),
    avg_return_rate: avgReturnRate * 100,
    days,
    is_preliminary: true,
  })
}

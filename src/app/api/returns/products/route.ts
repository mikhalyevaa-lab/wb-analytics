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
  const threshold = Math.min(100, Math.max(0, Number(searchParams.get('threshold') ?? 40)))
  const limit     = Math.min(200, Number(searchParams.get('limit') ?? 50))
  const offset    = Number(searchParams.get('offset') ?? 0)
  // min_sales — минимальный порог продаж чтобы фильтровать SKU с единичными данными
  const minSales  = Number(searchParams.get('min_sales') ?? 3)

  // Возвраты = for_pay < 0, выкупы = for_pay > 0
  // Фильтр: % выкупа < threshold (т.е. % возвратов > 100 - threshold)
  const maxBuyoutRatio = threshold / 100  // 0.40 для порога 40%

  const rows = await db<{
    nm_id: number
    supplier_article: string | null
    sales: number
    returns: number
    buyout_rate: number
    net_revenue: number
    returns_sum: number
  }[]>`
    SELECT
      nm_id,
      MAX(supplier_article) AS supplier_article,
      COUNT(*) FILTER (WHERE for_pay > 0)::int         AS sales,
      COUNT(*) FILTER (WHERE for_pay < 0)::int         AS returns,
      ROUND(
        COUNT(*) FILTER (WHERE for_pay > 0)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      )                                                 AS buyout_rate,
      ROUND(SUM(for_pay)::numeric, 0)                  AS net_revenue,
      ROUND(ABS(SUM(for_pay) FILTER (WHERE for_pay < 0))::numeric, 0) AS returns_sum
    FROM wb_sales
    WHERE store_id = ANY(${storeIds})
      AND is_realization = true
      AND date >= NOW() - INTERVAL '28 days'
    GROUP BY nm_id
    HAVING
      COUNT(*) FILTER (WHERE for_pay > 0) >= ${minSales}
      AND COUNT(*) FILTER (WHERE for_pay > 0)::numeric
        / NULLIF(COUNT(*), 0) < ${maxBuyoutRatio}
    ORDER BY buyout_rate ASC
    LIMIT ${limit} OFFSET ${offset}
  `

  // Общее число (для пагинации)
  const countRow = await db<{ total: number }[]>`
    SELECT COUNT(*) AS total FROM (
      SELECT nm_id
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= NOW() - INTERVAL '28 days'
      GROUP BY nm_id
      HAVING
        COUNT(*) FILTER (WHERE for_pay > 0) >= ${minSales}
        AND COUNT(*) FILTER (WHERE for_pay > 0)::numeric
          / NULLIF(COUNT(*), 0) < ${maxBuyoutRatio}
    ) sub
  `

  // Добавляем названия из products
  const nmIds = rows.map(r => r.nm_id)
  const products = nmIds.length
    ? await db<{ nm_id: number; title: string | null; photo_url: string | null }[]>`
        SELECT nm_id, title, photo_url FROM products
        WHERE store_id = ANY(${storeIds}) AND nm_id = ANY(${nmIds})
      `
    : []
  const prodMap = new Map(products.map(p => [p.nm_id, p]))

  const items = rows.map(r => ({
    nm_id:            Number(r.nm_id),
    article:          r.supplier_article ?? String(r.nm_id),
    title:            prodMap.get(Number(r.nm_id))?.title ?? null,
    photo_url:        prodMap.get(Number(r.nm_id))?.photo_url ?? null,
    sales_28d:        Number(r.sales),
    returns_28d:      Number(r.returns),
    buyout_rate:      Number(r.buyout_rate),
    net_revenue:      Number(r.net_revenue),
    returns_sum:      Number(r.returns_sum),
  }))

  return NextResponse.json({
    items,
    total: Number(countRow[0]?.total ?? 0),
    threshold,
    is_preliminary: true,
  })
}

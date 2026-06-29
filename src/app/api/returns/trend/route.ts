import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface TrendPoint {
  week_start: string   // YYYY-MM-DD
  sales: number
  returns: number
  buyout_pct: number | null
}

export interface TrendResponse {
  days84: TrendPoint[]
  summary28d: { sales: number; returns: number; buyout_pct: number | null }
  summary84d: { sales: number; returns: number; buyout_pct: number | null }
}

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const nmId = searchParams.get('nm_id') ?? ''

  // Понедельные точки за 84 дня
  const rows = await db<{
    week_start: string
    sales: number
    returns: number
    total: number
  }[]>`
    SELECT
      DATE_TRUNC('week', date)::date::text AS week_start,
      COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
      COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
      COUNT(*)::int AS total
    FROM wb_sales
    WHERE store_id = ANY(${storeIds})
      AND is_realization = true
      AND date >= NOW() - INTERVAL '84 days'
      ${nmId ? db`AND nm_id = ${parseInt(nmId)}` : db``}
    GROUP BY week_start
    ORDER BY week_start ASC
  `

  const days84: TrendPoint[] = rows.map(r => ({
    week_start: r.week_start,
    sales:      Number(r.sales),
    returns:    Number(r.returns),
    buyout_pct: r.total > 0
      ? Math.round(Number(r.sales) / Number(r.total) * 1000) / 10
      : null,
  }))

  // Сводки 28д и 84д
  const [agg28, agg84] = await Promise.all([
    db<{ sales: number; returns: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
        COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
        COUNT(*)::int AS total
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= NOW() - INTERVAL '28 days'
        ${nmId ? db`AND nm_id = ${parseInt(nmId)}` : db``}
    `,
    db<{ sales: number; returns: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
        COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
        COUNT(*)::int AS total
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= NOW() - INTERVAL '84 days'
        ${nmId ? db`AND nm_id = ${parseInt(nmId)}` : db``}
    `,
  ])

  const mkSummary = (r: { sales: number; returns: number; total: number }) => ({
    sales:      Number(r.sales),
    returns:    Number(r.returns),
    buyout_pct: Number(r.total) > 0
      ? Math.round(Number(r.sales) / Number(r.total) * 1000) / 10
      : null,
  })

  return NextResponse.json({
    days84,
    summary28d: mkSummary(agg28[0] ?? { sales: 0, returns: 0, total: 0 }),
    summary84d: mkSummary(agg84[0] ?? { sales: 0, returns: 0, total: 0 }),
  } satisfies TrendResponse)
}

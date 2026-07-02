import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export interface TrendPoint {
  week_start: string
  sales: number
  returns: number
  buyout_pct: number | null
}

export interface TrendResponse {
  points: TrendPoint[]
  summary: { sales: number; returns: number; buyout_pct: number | null }
}

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

  const from  = searchParams.get('from') ?? moscowDateStr(30)
  const to    = searchParams.get('to')   ?? moscowDateStr(0)
  const nmId  = searchParams.get('nm_id') ?? ''

  const fromTs = from + 'T00:00:00.000Z'
  const toTs   = to   + 'T23:59:59.999Z'

  const [rows, agg] = await Promise.all([
    // Понедельные точки за период
    db<{ week_start: string; sales: number; returns: number; total: number }[]>`
      SELECT
        DATE_TRUNC('week', date)::date::text AS week_start,
        COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
        COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
        COUNT(*)::int AS total
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
        ${nmId ? db`AND nm_id = ${parseInt(nmId)}` : db``}
      GROUP BY week_start
      ORDER BY week_start ASC
    `,

    // Итог за весь период
    db<{ sales: number; returns: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE for_pay > 0)::int AS sales,
        COUNT(*) FILTER (WHERE for_pay < 0)::int AS returns,
        COUNT(*)::int AS total
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
        ${nmId ? db`AND nm_id = ${parseInt(nmId)}` : db``}
    `,
  ])

  const points: TrendPoint[] = rows.map(r => ({
    week_start: r.week_start,
    sales:      Number(r.sales),
    returns:    Number(r.returns),
    buyout_pct: Number(r.total) > 0
      ? Math.round(Number(r.sales) / Number(r.total) * 1000) / 10
      : null,
  }))

  const s = agg[0] ?? { sales: 0, returns: 0, total: 0 }
  const summary = {
    sales:      Number(s.sales),
    returns:    Number(s.returns),
    buyout_pct: Number(s.total) > 0
      ? Math.round(Number(s.sales) / Number(s.total) * 1000) / 10
      : null,
  }

  return NextResponse.json({ points, summary } satisfies TrendResponse)
}

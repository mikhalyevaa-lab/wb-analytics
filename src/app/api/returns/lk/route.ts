import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Сравнение согласованных заявок ЛК WB (wb_lk_returns) с финансовыми возвратами (wb_sales for_pay < 0)
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

  const fromTs = from + 'T00:00:00.000Z'
  const toTs   = to   + 'T23:59:59.999Z'

  const [lkRow, finRow, byStatus, byCategoryLk, byCategoryFin] = await Promise.all([
    // Всего согласованных заявок ЛК WB за период
    db<{ total: number; unique_skus: number }[]>`
      SELECT
        COUNT(*)::int            AS total,
        COUNT(DISTINCT nm_id)::int AS unique_skus
      FROM wb_lk_returns
      WHERE store_id = ANY(${storeIds})
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
    `,

    // Финансовые возвраты (wb_sales)
    db<{ total: number; unique_skus: number; sum: number }[]>`
      SELECT
        COUNT(*)::int              AS total,
        COUNT(DISTINCT nm_id)::int AS unique_skus,
        COALESCE(ABS(SUM(for_pay)), 0)::numeric AS sum
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND for_pay < 0
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
    `,

    // Разбивка по статусам заявок ЛК
    db<{ status: string; count: number }[]>`
      SELECT
        COALESCE(return_status, 'unknown') AS status,
        COUNT(*)::int AS count
      FROM wb_lk_returns
      WHERE store_id = ANY(${storeIds})
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
      GROUP BY return_status
      ORDER BY count DESC
    `,

    // Топ категорий по заявкам ЛК
    db<{ category: string; count: number }[]>`
      SELECT
        COALESCE(category, 'Без категории') AS category,
        COUNT(*)::int AS count
      FROM wb_lk_returns
      WHERE store_id = ANY(${storeIds})
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `,

    // Топ категорий по финансовым возвратам
    db<{ category: string; count: number }[]>`
      SELECT
        COALESCE(subject, 'Без категории') AS category,
        COUNT(*)::int AS count
      FROM wb_sales
      WHERE store_id = ANY(${storeIds})
        AND is_realization = true
        AND for_pay < 0
        AND date >= ${fromTs}::timestamptz AND date <= ${toTs}::timestamptz
      GROUP BY subject
      ORDER BY count DESC
      LIMIT 10
    `,
  ])

  const lk  = lkRow[0]
  const fin = finRow[0]

  // Расхождение: заявок ЛК больше/меньше финансовых возвратов
  const diff    = Number(lk?.total ?? 0) - Number(fin?.total ?? 0)
  const diffPct = fin?.total ? Math.round(diff / Number(fin.total) * 100) : null

  return NextResponse.json({
    period: { from, to },
    lk_returns: {
      total:       Number(lk?.total       ?? 0),
      unique_skus: Number(lk?.unique_skus ?? 0),
    },
    fin_returns: {
      total:       Number(fin?.total       ?? 0),
      unique_skus: Number(fin?.unique_skus ?? 0),
      sum:         Math.round(Number(fin?.sum ?? 0)),
    },
    diff,
    diff_pct:    diffPct,
    by_status:   byStatus,
    by_category: {
      lk:  byCategoryLk,
      fin: byCategoryFin,
    },
  })
}

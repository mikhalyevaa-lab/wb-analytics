import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(session.user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from/to required' }, { status: 400 })

  const rows = await db<{ spend: string; views: string; clicks: string; orders_count: string; orders_sum: string }[]>`
    SELECT
      COALESCE(SUM(spend), 0)::text        AS spend,
      COALESCE(SUM(views), 0)::text        AS views,
      COALESCE(SUM(clicks), 0)::text       AS clicks,
      COALESCE(SUM(orders_count), 0)::text AS orders_count,
      COALESCE(SUM(orders_sum), 0)::text   AS orders_sum
    FROM wb_ad_spend
    WHERE store_id = ANY(${storeIds})
      AND date >= ${from}
      AND date <= ${to}
  `

  const r = rows[0]
  const spend       = Number(r?.spend ?? 0)
  const views       = Number(r?.views ?? 0)
  const clicks      = Number(r?.clicks ?? 0)
  const ordersCount = Number(r?.orders_count ?? 0)
  const ordersSum   = Number(r?.orders_sum ?? 0)

  const ctr = views  > 0 ? (clicks / views) * 100 : 0
  const cpc = clicks > 0 ? spend / clicks : 0
  const cpm = views  > 0 ? (spend / views) * 1000 : 0
  const ddr = ordersSum > 0 ? (spend / ordersSum) * 100 : 0

  return NextResponse.json({ spend, views, clicks, ordersCount, ordersSum, ctr, cpc, cpm, ddr })
}

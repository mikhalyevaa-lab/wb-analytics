import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

type NmRow = {
  nm_id: number | null
  nm_name: string | null
  spend: number | null
  views: number | null
  clicks: number | null
  orders_count: number | null
  orders_sum: number | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { id } = await params
  const campaignId = parseInt(id, 10)
  if (isNaN(campaignId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? ''
  const dateTo   = url.searchParams.get('to')   ?? ''
  if (!dateFrom || !dateTo) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('wb_ad_spend_nm')
    .select('nm_id, nm_name, spend, views, clicks, orders_count, orders_sum')
    .in('store_id', storeIds)
    .eq('campaign_id', campaignId)
    .gte('date', dateFrom)
    .lte('date', dateTo)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate by nm_id across dates
  const byNm = new Map<number, {
    nm_id: number; nm_name: string | null
    spend: number; views: number; clicks: number; orders_count: number; orders_sum: number
  }>()

  for (const r of (data ?? []) as NmRow[]) {
    if (!r.nm_id) continue
    const cur = byNm.get(r.nm_id) ?? {
      nm_id: r.nm_id, nm_name: r.nm_name ?? null,
      spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0,
    }
    cur.spend        += r.spend        ?? 0
    cur.views        += r.views        ?? 0
    cur.clicks       += r.clicks       ?? 0
    cur.orders_count += r.orders_count ?? 0
    cur.orders_sum   += r.orders_sum   ?? 0
    byNm.set(r.nm_id, cur)
  }

  const nms = [...byNm.values()]
    .filter(n => n.spend > 0 || n.views > 0 || n.clicks > 0)
    .map(n => ({
      ...n,
      spend:     Math.round(n.spend),
      orders_sum: Math.round(n.orders_sum),
    }))
    .sort((a, b) => b.spend - a.spend)

  const total = nms.reduce(
    (acc, n) => ({
      spend:        acc.spend        + n.spend,
      views:        acc.views        + n.views,
      clicks:       acc.clicks       + n.clicks,
      orders_count: acc.orders_count + n.orders_count,
      orders_sum:   acc.orders_sum   + n.orders_sum,
    }),
    { spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0 }
  )

  return NextResponse.json({ nms, total })
}

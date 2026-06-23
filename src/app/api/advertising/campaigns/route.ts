import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

// Moscow date (UTC+3) — used for all date defaults so server and client agree
function moscowDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

type Row = {
  campaign_id: number | null
  campaign_name: string | null
  spend: number | null
  views: number | null
  clicks: number | null
  orders_count: number | null
  orders_sum: number | null
}

// Paginate wb_ad_spend — PostgREST hard-caps at 1000 rows per request
async function fetchAllRows(storeIds: string[], dateFrom: string, dateTo: string): Promise<Row[]> {
  const adb = adminDb()
  const all: Row[] = []
  let page = 0
  while (true) {
    const { data, error } = await adb
      .from('wb_ad_spend')
      .select('campaign_id, campaign_name, spend, views, clicks, orders_count, orders_sum')
      .in('store_id', storeIds)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .range(page * 1000, (page + 1) * 1000 - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...(data as Row[]))
    if (data.length < 1000) break
    page++
  }
  return all
}

export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const url = req.nextUrl
  const dateFrom = url.searchParams.get('from') ?? moscowDateStr(30)
  const dateTo   = url.searchParams.get('to')   ?? moscowDateStr(0)

  let rows: Row[]
  try {
    rows = await fetchAllRows(storeIds, dateFrom, dateTo)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  // Aggregate by campaign_id
  const campMap = new Map<number, {
    campaign_name: string; spend: number; views: number
    clicks: number; orders_count: number; orders_sum: number
  }>()

  for (const r of rows) {
    if (!r.campaign_id) continue
    const cur = campMap.get(r.campaign_id) ?? {
      campaign_name: r.campaign_name ?? String(r.campaign_id),
      spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0,
    }
    cur.spend        += r.spend        ?? 0
    cur.views        += r.views        ?? 0
    cur.clicks       += r.clicks       ?? 0
    cur.orders_count += r.orders_count ?? 0
    cur.orders_sum   += r.orders_sum   ?? 0
    campMap.set(r.campaign_id, cur)
  }

  const campaigns = [...campMap.entries()].map(([campaign_id, v]) => ({
    campaign_id,
    campaign_name: v.campaign_name,
    spend:         Math.round(v.spend),
    views:         v.views,
    clicks:        v.clicks,
    orders_count:  v.orders_count,
    orders_sum:    Math.round(v.orders_sum),
    cpm:  v.views  > 0 ? +(v.spend / v.views  * 1000).toFixed(2) : 0,
    cpc:  v.clicks > 0 ? +(v.spend / v.clicks).toFixed(2) : 0,
    ctr:  v.views  > 0 ? +(v.clicks / v.views * 100).toFixed(2) : 0,
    drr:  v.orders_sum > 0 ? +(v.spend / v.orders_sum * 100).toFixed(1) : null,
  })).sort((a, b) => b.spend - a.spend)

  const totals = campaigns.reduce((acc, c) => ({
    spend:        acc.spend        + c.spend,
    views:        acc.views        + c.views,
    clicks:       acc.clicks       + c.clicks,
    orders_count: acc.orders_count + c.orders_count,
    orders_sum:   acc.orders_sum   + c.orders_sum,
  }), { spend: 0, views: 0, clicks: 0, orders_count: 0, orders_sum: 0 })

  const { data: syncRow } = await adminDb()
    .from('wb_ad_spend')
    .select('date, created_at')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sr = syncRow as { date?: string; created_at?: string } | null
  const lastSyncDate = sr?.date ?? null
  const lastSyncAt   = sr?.created_at ?? null

  return NextResponse.json({ campaigns, totals, dateFrom, dateTo, lastSyncDate, lastSyncAt, rowsScanned: rows.length })
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { db } from '@/lib/db'

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No stores' }, { status: 404 })

  const rows = await db<{
    min_date: string | null
    max_date: string | null
    days: number
    campaigns: number
    total_spend: number
  }[]>`
    SELECT
      MIN(date)::text                  AS min_date,
      MAX(date)::text                  AS max_date,
      COUNT(DISTINCT date)::int        AS days,
      COUNT(DISTINCT campaign_id)::int AS campaigns,
      COALESCE(SUM(spend), 0)          AS total_spend
    FROM wb_ad_spend
    WHERE store_id = ANY(${storeIds})
  `
  const row = rows[0] ?? {}
  return NextResponse.json({
    min_date:    row.min_date    ?? null,
    max_date:    row.max_date    ?? null,
    days:        Number(row.days ?? 0),
    campaigns:   Number(row.campaigns ?? 0),
    total_spend: Number(row.total_spend ?? 0),
  })
}

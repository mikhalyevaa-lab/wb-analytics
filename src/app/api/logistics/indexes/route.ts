import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'

// GET /api/logistics/indexes?weeks=8
export async function GET(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ rows: [] })

  const weeks = parseInt(req.nextUrl.searchParams.get('weeks') ?? '8')
  const { data, error } = await db
    .from('wb_logistics_indexes')
    .select('id, week_date, irp, localization_index')
    .in('store_id', storeIds)
    .order('week_date', { ascending: false })
    .limit(weeks)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

// POST /api/logistics/indexes
// body: { week_date: '2026-06-16', irp: 1.23, localization_index: 45.6 }
// or bulk: { rows: [{ week_date, irp, localization_index }] }
export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const body = await req.json()
  const items: { week_date: string; irp?: number; localization_index?: number }[] =
    body.rows ?? [body]

  const upsertData = items.map(r => ({
    store_id: storeId,
    week_date: r.week_date,
    irp: r.irp ?? null,
    localization_index: r.localization_index ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await db
    .from('wb_logistics_indexes')
    .upsert(upsertData, { onConflict: 'store_id,week_date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: upsertData.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { data } = await db
    .from('store_settings')
    .select('*')
    .eq('store_id', storeIds[0])
    .maybeSingle()

  return NextResponse.json(data ?? { store_id: storeIds[0] })
}

export async function PATCH(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const body = await req.json()
  const allowed = [
    'supply_days', 'safety_stock_days', 'ad_budget_limit', 'target_drr_pct',
    'control_window_days', 'plan_orders_per_day', 'plan_revenue_per_day', 'min_margin_pct',
  ]
  const patch: Record<string, unknown> = { store_id: storeIds[0], updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key]
  }

  const { data, error } = await db
    .from('store_settings')
    .upsert(patch, { onConflict: 'store_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

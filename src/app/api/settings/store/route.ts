import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { requireRole, CAN_EDIT_SETTINGS } from '@/lib/auth-roles'

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const { data } = await adminDb()
    .from('store_settings')
    .select('*')
    .eq('store_id', storeIds[0])
    .maybeSingle()

  return NextResponse.json(data ?? { store_id: storeIds[0] })
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const err = await requireRole(user.id, storeIds[0], CAN_EDIT_SETTINGS).catch(e => e)
  if (err?.status === 403) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const allowed = [
    'supply_days', 'safety_stock_days', 'ad_budget_limit', 'target_drr_pct',
    'control_window_days', 'plan_orders_per_day', 'plan_revenue_per_day', 'min_margin_pct',
    'usn_tax_pct', 'vat_pct',
  ]
  const patch: Record<string, unknown> = { store_id: storeIds[0], updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) {
      const v = body[key]
      // Пропускаем null/пустую строку — у NOT NULL колонок есть DB-дефолты
      if (v !== null && v !== '' && v !== undefined) patch[key] = v
    }
  }

  const { data, error } = await adminDb()
    .from('store_settings')
    .upsert(patch, { onConflict: 'store_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

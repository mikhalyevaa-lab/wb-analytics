// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { requireRole, CAN_EDIT_COST_PRICE } from '@/lib/auth-roles'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ nm_id: string }> }) {
  const { nm_id } = await params
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await adminDb().from('user_stores').select('store_id').eq('user_id', user.id)
  const storeIds = (stores ?? []).map(s => s.store_id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 403 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.group_id !== undefined) updates.group_id = body.group_id
  if (body.cost_price !== undefined) {
    // Проверяем роль только при изменении себестоимости
    const err = await requireRole(user.id, storeIds[0], CAN_EDIT_COST_PRICE).catch(e => e)
    if (err?.status === 403) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    updates.cost_price = body.cost_price
  }

  const { data, error } = await adminDb()
    .from('products')
    .update(updates)
    .eq('nm_id', parseInt(nm_id))
    .in('store_id', storeIds)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

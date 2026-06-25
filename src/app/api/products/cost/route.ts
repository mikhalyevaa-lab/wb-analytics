import { adminDb } from '@/lib/db-compat'
import { requireAuth } from '@/lib/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { store_id, nm_id, cost_price } = await req.json()
  if (!store_id || !nm_id || cost_price == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: membership } = await adminDb()
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminDb()
  const { error } = await admin
    .from('products')
    .update({ cost_price: Number(cost_price), updated_at: new Date().toISOString() })
    .eq('store_id', store_id)
    .eq('nm_id', nm_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

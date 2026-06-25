import { adminDb } from '@/lib/db-compat'
import { requireAuth } from '@/lib/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { store_id, date, category, description, amount } = body

  if (!store_id || !date || !category || !amount) {
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
  const { data, error } = await admin
    .from('manual_costs')
    .insert({ store_id, date, category, description: description || null, amount, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: cost } = await adminDb()
    .from('manual_costs')
    .select('store_id')
    .eq('id', id)
    .single()

  if (!cost) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await adminDb()
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', cost.store_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminDb()
  const { error } = await admin.from('manual_costs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

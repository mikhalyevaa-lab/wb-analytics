import { adminDb } from '@/lib/db-compat'
import { requireAuth } from '@/lib/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { store_id, credit_name, payment_date, principal, interest, total_payment } = body

  if (!store_id || !credit_name || !payment_date || !total_payment) {
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
    .from('credit_schedule')
    .insert({ store_id, credit_name, payment_date, principal: principal || 0, interest: interest || 0, total_payment })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, is_paid } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: row } = await adminDb().from('credit_schedule').select('store_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await adminDb()
    .from('user_stores').select('store_id').eq('user_id', user.id).eq('store_id', row.store_id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminDb()
  const { error } = await admin.from('credit_schedule').update({ is_paid }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  const { data: row } = await adminDb().from('credit_schedule').select('store_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await adminDb()
    .from('user_stores').select('store_id').eq('user_id', user.id).eq('store_id', row.store_id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = adminDb()
  const { error } = await admin.from('credit_schedule').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

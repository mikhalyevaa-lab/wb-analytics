import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

async function verifyGroupOwner(userId: string, groupId: string) {
  const { data } = await adminDb()
    .from('product_groups')
    .select('id, store_id, user_stores!inner(user_id)')
    .eq('id', groupId)
    .eq('user_stores.user_id', userId)
    .single()
  return !!data
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await verifyGroupOwner(user.id, id)
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.color !== undefined) updates.color = body.color

  const { data, error } = await adminDb()
    .from('product_groups')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await verifyGroupOwner(user.id, id)
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await adminDb().from('products').update({ group_id: null }).eq('group_id', id)

  const { error } = await adminDb().from('product_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

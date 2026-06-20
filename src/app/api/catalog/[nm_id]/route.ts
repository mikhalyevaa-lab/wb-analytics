import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ nm_id: string }> }) {
  const { nm_id } = await params
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await db.from('user_stores').select('store_id').eq('user_id', user.id)
  const storeIds = (stores ?? []).map(s => s.store_id)

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.group_id !== undefined) updates.group_id = body.group_id
  if (body.cost_price !== undefined) updates.cost_price = body.cost_price

  const { data, error } = await db
    .from('products')
    .update(updates)
    .eq('nm_id', parseInt(nm_id))
    .in('store_id', storeIds)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

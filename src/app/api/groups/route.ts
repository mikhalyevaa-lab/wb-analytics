// @ts-nocheck
import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await adminDb().from('user_stores').select('store_id').eq('user_id', user.id)
  const storeIds = (stores ?? []).map(s => s.store_id)

  const { data, error } = await adminDb()
    .from('product_groups')
    .select('*')
    .in('store_id', storeIds)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, color, store_id } = body

  // Verify user owns the store
  const { data: store } = await adminDb()
    .from('user_stores')
    .select('store_id')
    .eq('user_id', user.id)
    .eq('store_id', store_id)
    .single()

  if (!store) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await adminDb()
    .from('product_groups')
    .insert({ name, color: color || '#6366f1', store_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const status = req.nextUrl.searchParams.get('status')

  let query = adminDb().from('tasks')
    .select('*')
    .in('store_id', storeIds)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const body = await req.json()
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await adminDb().from('tasks').insert({
    store_id: storeIds[0],
    title: body.title.trim(),
    description: body.description ?? null,
    nm_id: body.nm_id ?? null,
    status: body.status ?? 'todo',
    priority: body.priority ?? 'medium',
    due_date: body.due_date ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

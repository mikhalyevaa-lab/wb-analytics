import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page') || 'catalog'

  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await db
    .from('user_column_settings')
    .select('columns')
    .eq('user_id', user.id)
    .eq('page', page)
    .single()

  return NextResponse.json({ columns: data?.columns ?? null })
}

export async function PUT(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { page = 'catalog', columns } = await req.json()

  const { error } = await db
    .from('user_column_settings')
    .upsert({ user_id: user.id, page, columns, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

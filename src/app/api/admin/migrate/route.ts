import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const db   = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' } })

  const sqls = [
    `ALTER TABLE wb_storage_daily ADD COLUMN IF NOT EXISTS barcodes_count integer`,
    `ALTER TABLE wb_storage_daily ADD COLUMN IF NOT EXISTS cost_per_unit numeric(12,6)`,
  ]

  const results: { sql: string; ok: boolean; error?: string }[] = []
  for (const sql of sqls) {
    const { error } = await (db as any).rpc('pg_query', { query: sql }).catch(() => ({ error: { message: 'rpc not available' } }))
    results.push({ sql, ok: !error, error: error?.message })
  }

  return NextResponse.json({ results })
}

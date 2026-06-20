import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runInitialSync, InitialSyncMethod } from '@/lib/sync-initial'

// Этот endpoint запускается локально — без таймаута Vercel
// Вызывать: curl -X POST http://localhost:3001/api/sync/initial \
//   -H "Authorization: Bearer <CRON_SECRET>" \
//   -H "Content-Type: application/json" \
//   -d '{"methods": ["stocks", "products"]}'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const methods: InitialSyncMethod[] = body.methods || ['all']

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: stores } = await admin
    .from('stores')
    .select('id, name, wb_token')

  if (!stores?.length) {
    return NextResponse.json({ error: 'No stores' }, { status: 400 })
  }

  const log: string[] = []
  const onProgress = (msg: string) => {
    console.log(`[initial-sync] ${msg}`)
    log.push(`${new Date().toISOString().substring(11, 19)} ${msg}`)
  }

  for (const store of stores) {
    await runInitialSync(store as { id: string; name: string; wb_token: string }, methods, onProgress)
  }

  return NextResponse.json({ ok: true, log })
}

// GET — состояние загрузки (из sync_log)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: logs } = await admin
    .from('sync_log')
    .select('method, date_from, date_to, rows_count, status, error, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const summary = (logs ?? []).reduce<Record<string, { chunks: number; rows: number; errors: number; last: string }>>(
    (acc, row) => {
      if (!acc[row.method]) acc[row.method] = { chunks: 0, rows: 0, errors: 0, last: '' }
      acc[row.method].chunks++
      acc[row.method].rows += row.rows_count ?? 0
      if (row.status === 'error') acc[row.method].errors++
      if (!acc[row.method].last || row.date_to > acc[row.method].last) acc[row.method].last = row.date_to
      return acc
    },
    {}
  )

  return NextResponse.json({ summary, recent: logs?.slice(0, 20) })
}

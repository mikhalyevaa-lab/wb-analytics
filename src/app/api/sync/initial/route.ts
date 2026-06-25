import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db-compat'
import { runInitialSync, InitialSyncMethod } from '@/lib/sync-initial'
import { requireAuth } from '@/lib/auth-server'

// Этот endpoint запускается локально — без таймаута Vercel
// Вызывать: curl -X POST http://localhost:3001/api/sync/initial \
//   -H "Authorization: Bearer <CRON_SECRET>" \
//   -H "Content-Type: application/json" \
//   -d '{"methods": ["stocks", "products"]}'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const methods: InitialSyncMethod[] = body.methods || ['all']

  const { data: stores } = await adminDb()
    .from('stores')
    .select('id, name, wb_token, wb_analytics_token')

  if (!stores?.length) {
    return NextResponse.json({ error: 'No stores' }, { status: 400 })
  }

  const log: string[] = []
  const onProgress = (msg: string) => {
    console.log(`[initial-sync] ${msg}`)
    log.push(`${new Date().toISOString().substring(11, 19)} ${msg}`)
  }

  for (const store of stores) {
    await runInitialSync(store as { id: string; name: string; wb_token: string; wb_analytics_token?: string }, methods, onProgress)
  }

  return NextResponse.json({ ok: true, log })
}

// GET — состояние загрузки (из sync_log)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: logs } = await adminDb()
    .from('sync_log')
    .select('method, date_from, date_to, rows_count, status, error, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (logs ?? []).reduce((acc: Record<string, any>, row: any) => {
    if (!acc[row.method]) acc[row.method] = { chunks: 0, rows: 0, errors: 0, last: '' }
    acc[row.method].chunks++
    acc[row.method].rows += row.rows_count ?? 0
    if (row.status === 'error') acc[row.method].errors++
    if (!acc[row.method].last || row.date_to > acc[row.method].last) acc[row.method].last = row.date_to
    return acc
  }, {})

  return NextResponse.json({ summary, recent: logs?.slice(0, 20) })
}

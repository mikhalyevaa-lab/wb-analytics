import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncAdvertPeriod } from '@/lib/sync'

const CRON_SECRET = process.env.CRON_SECRET

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { storeId?: string; dateFrom?: string; dateTo?: string } = {}
  try { body = await req.json() } catch { /* empty body OK */ }

  // WB хранит рекламную статистику за последние 90 дней
  const dateTo   = body.dateTo   ?? new Date().toISOString().split('T')[0]
  const dateFrom = body.dateFrom ?? new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

  let storeIds: string[]
  if (body.storeId) {
    storeIds = [body.storeId]
  } else {
    const db = adminClient()
    const { data } = await db.from('stores').select('id')
    storeIds = (data ?? []).map(r => r.id as string)
  }

  if (!storeIds.length) {
    return NextResponse.json({ error: 'No stores found' }, { status: 404 })
  }

  const summary: Record<string, { inserted: number; errors: number }> = {}
  for (const storeId of storeIds) {
    try {
      console.log(`[advert-initial] store=${storeId} from=${dateFrom} to=${dateTo}`)
      const result = await syncAdvertPeriod(storeId, dateFrom, dateTo)
      summary[storeId] = result
      console.log(`[advert-initial] store=${storeId}: inserted=${result.inserted}, errors=${result.errors}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[advert-initial] store=${storeId} error:`, msg)
      summary[storeId] = { inserted: -1, errors: 1 }
    }
  }

  return NextResponse.json({ ok: true, dateFrom, dateTo, summary })
}

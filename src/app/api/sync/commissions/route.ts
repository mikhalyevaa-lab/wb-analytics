import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createWBClient } from '@/lib/wb-api'
import { requireAuth } from '@/lib/auth-server'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!isCron) {
    const user = await requireAuth().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminDb()
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, wb_token')

  if (!stores?.length) return NextResponse.json({ error: 'No stores found' }, { status: 404 })

  const results: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]

  for (const store of stores) {
    const wb = createWBClient(store.wb_token)
    const t0 = Date.now()
    let total = 0
    let logError: string | null = null
    try {
      const commissions = await wb.getCommissions()
      if (commissions.length) {
        const rows = commissions.map(c => ({
          store_id:          store.id,
          subject_id:        c.subjectID,
          subject_name:      c.subjectName,
          parent_id:         c.parentID,
          parent_name:       c.parentName,
          kgvp_supplier:     c.kgvpSupplier,
          kgvp_marketplace:  c.kgvpMarketplace,
          kgvp_pickup:       c.kgvpPickup,
          kgvp_booking:      c.kgvpBooking,
          paid_storage_kgvp: c.paidStorageKgvp,
          loaded_at:         new Date().toISOString(),
        }))

        for (let i = 0; i < rows.length; i += 500) {
          const { error, count } = await admin
            .from('wb_commissions')
            .upsert(rows.slice(i, i + 500), { onConflict: 'store_id,subject_id' })
          if (error) throw error
          total += count || rows.slice(i, i + 500).length
        }
      }
      results[store.name] = { count: total }
    } catch (err) {
      logError = err instanceof Error ? err.message : String(err)
      results[store.name] = { error: logError }
    }

    await admin.from('sync_log').insert({
      store_id:    store.id,
      method:      'commissions',
      date_from:   today,
      date_to:     today,
      rows_count:  total,
      status:      logError ? 'error' : 'ok',
      error:       logError,
      duration_ms: Date.now() - t0,
    })
  }

  return NextResponse.json({ ok: true, results })
}

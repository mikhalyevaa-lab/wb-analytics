import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createWBClient } from '@/lib/wb-api'

const CRON_SECRET = process.env.CRON_SECRET

function adminClient() {
  return createAdminClient(
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

  const admin = adminClient()
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, wb_token')

  if (!stores?.length) return NextResponse.json({ error: 'No stores found' }, { status: 404 })

  const results: Record<string, unknown> = {}

  for (const store of stores) {
    const wb = createWBClient(store.wb_token)
    try {
      const commissions = await wb.getCommissions()
      if (!commissions.length) { results[store.name] = { count: 0 }; continue }

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

      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        const { error, count } = await admin
          .from('wb_commissions')
          .upsert(rows.slice(i, i + 500), { onConflict: 'store_id,subject_id' })
        if (error) throw error
        total += count || rows.slice(i, i + 500).length
      }
      results[store.name] = { count: total }
    } catch (err) {
      results[store.name] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({ ok: true, results })
}

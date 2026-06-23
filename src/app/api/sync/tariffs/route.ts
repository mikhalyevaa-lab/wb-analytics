import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createWBClient, parseWBNum } from '@/lib/wb-api'

const CRON_SECRET = process.env.CRON_SECRET

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function upsertRows(
  admin: ReturnType<typeof adminClient>,
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
  chunkSize = 200
) {
  let total = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error, count } = await admin.from(table).upsert(chunk, { onConflict: conflict })
    if (error) throw error
    total += count || chunk.length
  }
  return total
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const { data: stores } = await admin.from('stores').select('id, name, wb_token')
  if (!stores?.length) return NextResponse.json({ error: 'No stores found' }, { status: 404 })

  const results: Record<string, unknown> = {}
  const today = new Date().toISOString().split('T')[0]

  for (const store of stores) {
    const wb = createWBClient(store.wb_token)
    const startMs = Date.now()
    const { data: logRow } = await admin
      .from('sync_log')
      .insert({ store_id: store.id, method: 'tariffs', status: 'running' })
      .select('id').single()

    let total = 0
    let logError: string | null = null

    try {
      // Box tariffs
      const boxResp = await wb.getBoxTariffs(today)
      const boxList = boxResp?.response?.data?.warehouseList ?? []
      const dtNextBox    = boxResp?.response?.data?.dtNextBox ?? null
      const dtTillMaxBox = boxResp?.response?.data?.dtTillMax ?? null

      if (boxList.length) {
        const boxRows = boxList.map(t => ({
          store_id:           store.id,
          tariff_type:        'box',
          warehouse_name:     t.warehouseName,
          geo_name:           t.geoName ?? null,
          delivery_base:      parseWBNum(t.boxDeliveryBase),
          delivery_liter:     parseWBNum(t.boxDeliveryLiter),
          delivery_coef_expr: parseWBNum(t.boxDeliveryCoefExpr),
          storage_base:       parseWBNum(t.boxStorageBase),
          storage_liter:      parseWBNum(t.boxStorageLiter),
          storage_coef_expr:  parseWBNum(t.boxStorageCoefExpr),
          dt_next_change:     dtNextBox ? dtNextBox.split('T')[0] : null,
          dt_till_max:        dtTillMaxBox ? dtTillMaxBox.split('T')[0] : null,
          loaded_at:          new Date().toISOString(),
        }))

        total += await upsertRows(admin, 'wb_tariffs', boxRows, 'store_id,tariff_type,warehouse_name')

        // Daily snapshot в историю
        const histRows = boxRows.map(r => ({ ...r, snapshot_date: today }))
        await upsertRows(admin, 'wb_tariffs_history', histRows, 'store_id,tariff_type,warehouse_name,snapshot_date')
      }

      await sleep(61000) // 1 req/min лимит WB common-api

      // Return tariffs
      const retResp = await wb.getReturnTariffs(today)
      const retList = retResp?.response?.data?.warehouseList ?? []
      const dtTillMaxRet = retResp?.response?.data?.dtTillMax ?? null

      if (retList.length) {
        const retRows = retList.map(t => ({
          store_id:             store.id,
          tariff_type:          'return',
          warehouse_name:       t.warehouseName,
          return_office_base:   parseWBNum(t.deliveryDumpSupOfficeBase),
          return_office_liter:  parseWBNum(t.deliveryDumpSupOfficeLiter),
          return_courier_base:  parseWBNum(t.deliveryDumpSupCourierBase),
          return_courier_liter: parseWBNum(t.deliveryDumpSupCourierLiter),
          dt_till_max:          dtTillMaxRet ? dtTillMaxRet.split('T')[0] : null,
          loaded_at:            new Date().toISOString(),
        }))

        total += await upsertRows(admin, 'wb_tariffs', retRows, 'store_id,tariff_type,warehouse_name')

        const histRows = retRows.map(r => ({ ...r, snapshot_date: today }))
        await upsertRows(admin, 'wb_tariffs_history', histRows, 'store_id,tariff_type,warehouse_name,snapshot_date')
      }

      results[store.name] = { count: total, box: boxList.length, return: retList.length }
    } catch (err) {
      logError = err instanceof Error ? err.message : String(err)
      results[store.name] = { error: logError }
    }

    if (logRow?.id) {
      await admin.from('sync_log').update({
        finished_at: new Date().toISOString(),
        rows_count:  total,
        status:      logError ? 'error' : 'ok',
        error:       logError,
        duration_ms: Date.now() - startMs,
      }).eq('id', logRow.id)
    }
  }

  return NextResponse.json({ ok: true, results })
}

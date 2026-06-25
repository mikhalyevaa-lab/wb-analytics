import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/db-compat'
import { createWBClient, parseWBNum } from '@/lib/wb-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // box + 62s sleep + return ≈ 2.5 мин

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertChunks(admin: any, table: string, rows: Record<string, unknown>[], conflict: string) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await (admin.from(table) as any).upsert(chunk, { onConflict: conflict })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminDb()
  const today = new Date().toISOString().split('T')[0]
  const results: Record<string, { box: number; return: number } | { error: string }> = {}

  // Все магазины с wb_token
  const { data: stores } = await (admin.from('stores') as any)
    .select('id, name, wb_token')
    .not('wb_token', 'is', null)
    .limit(50)

  if (!stores?.length) {
    return NextResponse.json({ ok: true, message: 'no stores' })
  }

  for (const store of stores as { id: string; name: string; wb_token: string }[]) {
    try {
      const wb = createWBClient(store.wb_token)

      // Box тарифы (доставка + хранение)
      const boxResp = await wb.getBoxTariffs(today)
      const boxList = boxResp?.response?.data?.warehouseList ?? []
      const dtNextBox    = boxResp?.response?.data?.dtNextBox    ?? null
      const dtTillMaxBox = boxResp?.response?.data?.dtTillMax    ?? null

      let boxCount = 0
      if (boxList.length) {
        const rows = boxList.map((t: any) => ({
          store_id:           store.id,
          snapshot_date:      today,
          tariff_type:        'box',
          warehouse_name:     t.warehouseName,
          geo_name:           t.geoName ?? null,
          delivery_base:      parseWBNum(t.boxDeliveryBase),
          delivery_liter:     parseWBNum(t.boxDeliveryLiter),
          delivery_coef_expr: parseWBNum(t.boxDeliveryCoefExpr),
          storage_base:       parseWBNum(t.boxStorageBase),
          storage_liter:      parseWBNum(t.boxStorageLiter),
          storage_coef_expr:  parseWBNum(t.boxStorageCoefExpr),
          dt_next_change:     dtNextBox    ? dtNextBox.split('T')[0]    : null,
          dt_till_max:        dtTillMaxBox ? dtTillMaxBox.split('T')[0] : null,
          loaded_at:          new Date().toISOString(),
        }))
        // Актуальный снапшот
        await upsertChunks(admin, 'wb_tariffs', rows.map(({ snapshot_date: _sd, ...r }: any) => r), 'store_id,tariff_type,warehouse_name')
        // Исторический снапшот
        await upsertChunks(admin, 'wb_tariffs_history', rows, 'store_id,tariff_type,warehouse_name,snapshot_date')
        boxCount = rows.length
      }

      // Пауза 62 сек — лимит WB API 1 req/min
      await sleep(62000)

      // Return тарифы (возвраты)
      const retResp = await wb.getReturnTariffs(today)
      const retList  = retResp?.response?.data?.warehouseList ?? []
      const dtTillMaxRet = retResp?.response?.data?.dtTillMax ?? null

      let retCount = 0
      if (retList.length) {
        const rows = retList.map((t: any) => ({
          store_id:             store.id,
          snapshot_date:        today,
          tariff_type:          'return',
          warehouse_name:       t.warehouseName,
          return_office_base:   parseWBNum(t.deliveryDumpSupOfficeBase),
          return_office_liter:  parseWBNum(t.deliveryDumpSupOfficeLiter),
          return_courier_base:  parseWBNum(t.deliveryDumpSupCourierBase),
          return_courier_liter: parseWBNum(t.deliveryDumpSupCourierLiter),
          dt_till_max:          dtTillMaxRet ? dtTillMaxRet.split('T')[0] : null,
          loaded_at:            new Date().toISOString(),
        }))
        await upsertChunks(admin, 'wb_tariffs', rows.map(({ snapshot_date: _sd, ...r }: any) => r), 'store_id,tariff_type,warehouse_name')
        await upsertChunks(admin, 'wb_tariffs_history', rows, 'store_id,tariff_type,warehouse_name,snapshot_date')
        retCount = rows.length
      }

      results[store.name] = { box: boxCount, return: retCount }
      console.log(`[cron/tariffs] ${store.name}: box=${boxCount}, return=${retCount}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/tariffs] ${store.name}:`, msg)
      results[store.name] = { error: msg }
    }
  }

  return NextResponse.json({ ok: true, date: today, results })
}

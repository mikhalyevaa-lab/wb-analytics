import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

const CHUNK_SIZE = 500

interface ImportRow { [key: string]: unknown }

export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const body = await req.json() as {
    type: 'wb_finance' | 'wb_orders' | 'wb_ad_spend'
    rows: ImportRow[]
    columns: { index: number; header: string; field: string | null }[]
  }

  const { type, rows, columns } = body
  if (!type || !rows?.length) return NextResponse.json({ error: 'Missing type or rows' }, { status: 400 })

  const fieldMap: Record<number, string> = {}
  for (const col of columns) {
    if (col.field) fieldMap[col.index] = col.field
  }

  try {
    if (type === 'wb_finance')  return await importFinance(storeId, rows, fieldMap)
    if (type === 'wb_orders')   return await importOrders(storeId, rows, fieldMap)
    if (type === 'wb_ad_spend') return await importAdSpend(storeId, rows, fieldMap)
    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── Finance ─────────────────────────────────────────────────────────────────

async function importFinance(storeId: string, rows: ImportRow[], fieldMap: Record<number, string>) {
  const adb = adminDb()

  // Fetch existing rrd_ids to dedup
  const { data: existing } = await adb
    .from('wb_finance')
    .select('rrd_id')
    .eq('store_id', storeId)
    .limit(500000)

  const existingIds = new Set((existing ?? []).map((r: { rrd_id: number }) => r.rrd_id))

  const toInsert: ImportRow[] = []
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap)
    const rrdId = Number(mapped.rrd_id)
    if (!rrdId || isNaN(rrdId)) { errors++; continue }
    if (existingIds.has(rrdId)) { skipped++; continue }
    existingIds.add(rrdId)

    toInsert.push({
      store_id:             storeId,
      rrd_id:               rrdId,
      realizationreport_id: Number(mapped.realizationreport_id) || null,
      nm_id:                Number(mapped.nm_id) || null,
      brand_name:           mapped.brand_name ?? null,
      sa_name:              mapped.sa_name ?? null,
      subject_name:         mapped.subject_name ?? null,
      doc_type_name:        mapped.doc_type_name ?? null,
      supplier_oper_name:   mapped.supplier_oper_name ?? null,
      quantity:             Number(mapped.quantity) || 0,
      retail_price:         Number(mapped.retail_price) || 0,
      retail_amount:        Number(mapped.retail_amount) || 0,
      ppvz_for_pay:         Number(mapped.ppvz_for_pay) || 0,
      delivery_rub:         Number(mapped.delivery_rub) || 0,
      penalty:              Number(mapped.penalty) || 0,
      additional_payment:   Number(mapped.additional_payment) || 0,
      storage_fee:          Number(mapped.storage_fee) || 0,
      acceptance:           Number(mapped.acceptance) || 0,
      deduction:            Number(mapped.deduction) || 0,
      commission_percent:   Number(mapped.commission_percent) || null,
      date_from:            parseDate(mapped.date_from),
      date_to:              parseDate(mapped.date_to),
      sale_dt:              parseDate(mapped.sale_dt),
      order_dt:             parseDate(mapped.order_dt),
    })
  }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_finance').insert(toInsert.slice(i, i + CHUNK_SIZE) as any)
    if (error) { errors += CHUNK_SIZE; console.error('[import/finance]', error.message) }
    else inserted += toInsert.slice(i, i + CHUNK_SIZE).length
  }

  return NextResponse.json({ inserted, skipped, errors, total: rows.length })
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function importOrders(storeId: string, rows: ImportRow[], fieldMap: Record<number, string>) {
  const adb = adminDb()

  const { data: existing } = await adb
    .from('wb_orders')
    .select('srid')
    .eq('store_id', storeId)
    .limit(500000)

  const existingSrids = new Set((existing ?? []).map((r: { srid: string }) => r.srid))

  const toInsert: ImportRow[] = []
  let skipped = 0, errors = 0

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap)
    const srid = String(mapped.srid ?? '').trim()
    if (!srid) { errors++; continue }
    if (existingSrids.has(srid)) { skipped++; continue }
    existingSrids.add(srid)

    const isCancel = String(mapped.is_cancel ?? '').toLowerCase()
    toInsert.push({
      store_id:         storeId,
      srid,
      date:             parseDate(mapped.date),
      nm_id:            Number(mapped.nm_id) || null,
      supplier_article: mapped.supplier_article ?? null,
      subject:          mapped.subject ?? null,
      category:         mapped.category ?? null,
      brand:            mapped.brand ?? null,
      total_price:      Number(mapped.total_price) || 0,
      discount_percent: Number(mapped.discount_percent) || 0,
      spp:              Number(mapped.spp) || 0,
      is_cancel:        isCancel === 'true' || isCancel === '1' || isCancel === 'да',
      g_number:         mapped.g_number ?? null,
      warehouse_name:   mapped.warehouse_name ?? null,
      region_name:      mapped.region_name ?? null,
    })
  }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_orders').insert(toInsert.slice(i, i + CHUNK_SIZE) as any)
    if (error) { errors += CHUNK_SIZE; console.error('[import/orders]', error.message) }
    else inserted += toInsert.slice(i, i + CHUNK_SIZE).length
  }

  return NextResponse.json({ inserted, skipped, errors, total: rows.length })
}

// ─── Ad Spend ────────────────────────────────────────────────────────────────

async function importAdSpend(storeId: string, rows: ImportRow[], fieldMap: Record<number, string>) {
  const adb = adminDb()
  const toUpsert: ImportRow[] = []
  let errors = 0

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap)
    const campaignId = Number(mapped.campaign_id)
    const date = parseDate(mapped.date)
    if (!campaignId || !date) { errors++; continue }

    toUpsert.push({
      store_id:      storeId,
      campaign_id:   campaignId,
      campaign_name: mapped.campaign_name ?? String(campaignId),
      date,
      spend:         Number(mapped.spend)        || 0,
      views:         Number(mapped.views)        || 0,
      clicks:        Number(mapped.clicks)       || 0,
      orders_count:  Number(mapped.orders_count) || 0,
      orders_sum:    Number(mapped.orders_sum)   || 0,
    })
  }

  let inserted = 0
  for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
    const { error } = await adb.from('wb_ad_spend')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(toUpsert.slice(i, i + CHUNK_SIZE) as any, { onConflict: 'store_id,campaign_id,date' })
    if (error) { errors += CHUNK_SIZE; console.error('[import/adspend]', error.message) }
    else inserted += toUpsert.slice(i, i + CHUNK_SIZE).length
  }

  return NextResponse.json({ inserted, skipped: 0, errors, total: rows.length })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(row: ImportRow, fieldMap: Record<number, string>): Record<string, unknown> {
  const values = Object.values(row)
  const result: Record<string, unknown> = {}
  for (const [indexStr, field] of Object.entries(fieldMap)) {
    result[field] = values[Number(indexStr)]
  }
  return result
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD.MM.YYYY
  const parts = s.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  // Excel serial number
  const n = Number(s)
  if (!isNaN(n) && n > 40000) {
    const d = new Date((n - 25569) * 86400000)
    return d.toISOString().split('T')[0]
  }
  return null
}

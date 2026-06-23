import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'

const CHUNK_SIZE = 500

function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parts = s.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  const num = Number(s)
  if (!isNaN(num) && num > 40000) {
    const d = new Date((num - 25569) * 86400000)
    return d.toISOString().split('T')[0]
  }
  return null
}

function n(val: unknown): number | null {
  const v = Number(val)
  return isNaN(v) ? null : v
}

export async function POST(req: NextRequest) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const reportNumberParam = formData.get('reportNumber') as string | null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())

  let xlsxBuf: Buffer
  let xlsxName = file.name

  try {
    const zip = new AdmZip(buf)
    const entries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.xlsx'))
    if (!entries.length) return NextResponse.json({ error: 'No XLSX found in ZIP' }, { status: 400 })
    xlsxBuf = zip.readFile(entries[0]) as Buffer
    xlsxName = entries[0].name
  } catch {
    return NextResponse.json({ error: 'Failed to read ZIP' }, { status: 400 })
  }

  // Extract report number from filename
  const match = xlsxName.match(/№(\d+)/) ?? file.name.match(/№(\d+)/)
  let reportNumber = match ? Number(match[1]) : Number(reportNumberParam)
  if (!reportNumber) return NextResponse.json({ error: 'Cannot determine report number' }, { status: 400 })

  const wb = XLSX.read(xlsxBuf, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][]

  const rows = raw.slice(1) // skip header row

  const adb = adminDb()
  const toUpsert: Record<string, unknown>[] = []
  const seenRowNums = new Set<number>()
  let skipped = 0

  for (const row of rows) {
    const rowNum = n(row[0])
    if (rowNum == null) { skipped++; continue }
    if (seenRowNums.has(rowNum)) { skipped++; continue }
    seenRowNums.add(rowNum)

    toUpsert.push({
      store_id: storeId,
      report_number: reportNumber,
      row_number: rowNum,
      supply_number: row[1] ?? null,
      subject: row[2] ?? null,
      nm_id: n(row[3]),
      brand: row[4] ?? null,
      supplier_article: row[5] ?? null,
      title: row[6] ?? null,
      techsize: row[7] ?? null,
      barcode: row[8] ?? null,
      doc_type: row[9] ?? null,
      payment_reason: row[10] ?? null,
      order_date: parseDate(row[11]),
      sale_date: parseDate(row[12]),
      quantity: n(row[13]),
      retail_price: n(row[14]),
      wb_sale_amount: n(row[15]),
      agreed_product_discount_pct: n(row[16]),
      promo_code_pct: n(row[17]),
      total_agreed_discount_pct: n(row[18]),
      retail_price_with_discount: n(row[19]),
      kvv_rating_reduction_pct: n(row[20]),
      kvv_promo_change_pct: n(row[21]),
      platform_discounts_pct: n(row[22]),
      kvv_pct: n(row[23]),
      kvv_base_excl_vat_pct: n(row[24]),
      kvv_final_excl_vat_pct: n(row[25]),
      commission_before_agent_excl_vat: n(row[26]),
      pvz_compensation: n(row[27]),
      payment_service_compensation: n(row[28]),
      payment_service_compensation_pct: n(row[29]),
      payment_service_type: row[30] ?? null,
      wb_commission_excl_vat: n(row[31]),
      wb_commission_vat: n(row[32]),
      for_pay_seller: n(row[33]),
      deliveries_count: n(row[34]),
      returns_count: n(row[35]),
      delivery_service_cost: n(row[36]),
      fix_start_date: parseDate(row[37]),
      fix_end_date: parseDate(row[38]),
      paid_delivery_flag: row[39] ?? null,
      total_fines: n(row[40]),
      wb_commission_correction: n(row[41]),
      logistics_fines_types: row[42] ?? null,
      sticker: row[43] ?? null,
      acquirer_bank: row[44] ?? null,
      office_number: row[45] == null ? null : String(row[45]),
      office_name: row[46] ?? null,
      partner_inn: row[47] == null ? null : String(row[47]),
      partner: row[48] ?? null,
      warehouse: row[49] ?? null,
      country: row[50] ?? null,
      box_type: row[51] ?? null,
      customs_declaration_number: row[52] == null ? null : String(row[52]),
      assembly_task_number: row[53] == null ? null : String(row[53]),
      marking_code: row[54] == null ? null : String(row[54]),
      barcode_sticker: row[55] == null ? null : String(row[55]),
      srid: row[56] == null ? null : String(row[56]),
      transport_compensation: n(row[57]),
      transport_organizer: row[58] ?? null,
      row_storage_cost: n(row[59]),
      deductions: n(row[60]),
      acceptance_operations: n(row[61]),
      chrt_id: n(row[62]),
      fixed_warehouse_coef: n(row[63]),
      legal_entity_sale_flag: row[64] == null ? null : String(row[64]),
      tmc: row[65] ?? null,
      box_number: row[66] == null ? null : String(row[66]),
      cofinancing_discount: n(row[67]),
      wibes_discount_pct: n(row[68]),
      loyalty_discount_compensation: n(row[69]),
      loyalty_program_cost: n(row[70]),
      loyalty_points_deducted: n(row[71]),
      basket_id: row[72] == null ? null : String(row[72]),
      one_time_payment_change: n(row[73]),
      sale_method_type: row[74] ?? null,
      seller_promo_id: row[75] == null ? null : String(row[75]),
      seller_promo_discount_pct: n(row[76]),
      seller_loyalty_discount_id: row[77] == null ? null : String(row[77]),
      seller_loyalty_discount_pct: n(row[78]),
      promo_code_id: row[79] == null ? null : String(row[79]),
      promo_code_discount_pct: n(row[80]),
      substitution_article_id: row[81] == null ? null : String(row[81]),
      substitution_article_discount_pct: n(row[82]),
      wholesale_discount_pct: n(row[83]),
    })
  }

  let inserted = 0
  for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_weekly_report_rows').upsert(toUpsert.slice(i, i + CHUNK_SIZE) as any, { onConflict: 'store_id,report_number,row_number' })
    if (error) console.error('[import/wb-weekly-report-zip]', error.message)
    else inserted += toUpsert.slice(i, i + CHUNK_SIZE).length
  }

  if (inserted > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adb.from('wb_weekly_reports') as any)
      .update({ has_detail_rows: true })
      .eq('store_id', storeId)
      .eq('report_number', reportNumber)
  }

  return NextResponse.json({ ok: true, inserted, skipped, reportNumber })
}

import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

const CHUNK_SIZE = 500

function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parts = s.split('.')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  const n = Number(s)
  if (!isNaN(n) && n > 40000) {
    const d = new Date((n - 25569) * 86400000)
    return d.toISOString().split('T')[0]
  }
  return null
}

function n(val: unknown): number | null {
  const v = Number(val)
  return isNaN(v) ? null : v
}

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const body = await req.json() as {
    fileType: 'summary' | 'detail'
    reportNumber?: number
    reportSource?: 'weekly' | 'daily'
    rows: (string | number | null)[][]
    headers: string[]
  }

  const { fileType, rows, reportNumber, reportSource = 'weekly' } = body
  if (!fileType || !rows?.length) return NextResponse.json({ error: 'Missing fileType or rows' }, { status: 400 })

  try {
    if (fileType === 'summary') return await importSummary(storeId, rows)
    if (fileType === 'detail') {
      if (!reportNumber) return NextResponse.json({ error: 'reportNumber required for detail' }, { status: 400 })
      return await importDetail(storeId, reportNumber, reportSource, rows)
    }
    return NextResponse.json({ error: 'Unknown fileType' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function importSummary(storeId: string, rows: (string | number | null)[][]) {
  const adb = adminDb()

  const HEADER_MAP: Record<string, string> = {
    '№ отчёта': 'report_number',
    '№ отчета': 'report_number',
    'Юридическое лицо': 'legal_entity',
    'Дата начала': 'date_from',
    'Дата конца': 'date_to',
    'Дата формирования': 'date_created',
    'Тип отчёта': 'report_type',
    'Тип отчета': 'report_type',
    'Продажа': 'sale',
    'В том числе Компенсация скидки по программе лояльности': 'loyalty_compensation',
    'К перечислению за товар': 'for_pay',
    'Согласованная скидка, %': 'agreed_discount_pct',
    'Стоимость логистики': 'logistics_cost',
    'Стоимость хранения': 'storage_cost',
    'Стоимость операций при приёмке': 'acceptance_cost',
    'Стоимость операций на приемке': 'acceptance_cost',
    'Прочие удержания/выплаты': 'other_deductions',
    'Общая сумма штрафов': 'total_fines',
    'Корректировка Вознаграждения Вайлдберриз (ВВ)': 'wb_commission_correction',
    'Стоимость участия в программе лояльности': 'loyalty_program_cost',
    'Сумма баллов, удержанных по программе лояльности': 'loyalty_points_deducted',
    'Разовое изменение срока перечисления денежных средств': 'one_time_payment_change',
    'Итого к оплате': 'total_to_pay',
    'Валюта': 'currency',
  }

  // Find header row
  let headerRowIndex = -1
  let colMap: Record<number, string> = {}

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i]
    const mapped: Record<number, string> = {}
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? '').trim()
      if (HEADER_MAP[cell]) mapped[j] = HEADER_MAP[cell]
    }
    if (Object.keys(mapped).length > 3) {
      headerRowIndex = i
      colMap = mapped
      break
    }
  }

  if (headerRowIndex === -1) return NextResponse.json({ error: 'Header row not found' }, { status: 400 })

  const toUpsert: Record<string, unknown>[] = []

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const rec: Record<string, unknown> = { store_id: storeId }

    for (const [idxStr, field] of Object.entries(colMap)) {
      const val = row[Number(idxStr)]
      if (field === 'report_number') rec[field] = Number(val) || null
      else if (['date_from', 'date_to', 'date_created'].includes(field)) rec[field] = parseDate(val)
      else if (field === 'legal_entity' || field === 'report_type' || field === 'currency') rec[field] = val ?? null
      else rec[field] = n(val)
    }

    if (!rec.report_number) continue
    toUpsert.push(rec)
  }

  let inserted = 0
  for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_weekly_reports').upsert(toUpsert.slice(i, i + CHUNK_SIZE) as any, { onConflict: 'store_id,report_number' })
    if (error) console.error('[import/wb-weekly-report/summary]', error.message)
    else inserted += toUpsert.slice(i, i + CHUNK_SIZE).length
  }

  const reportNumbers = toUpsert.map(r => r.report_number as number).filter(Boolean)
  return NextResponse.json({ ok: true, inserted, skipped: 0, reportNumber: reportNumbers[0] ?? null })
}

async function importDetail(storeId: string, reportNumber: number, reportSource: 'weekly' | 'daily', rows: (string | number | null)[][]) {
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
      report_source: reportSource,
      row_number: n(row[0]),
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
    if (error) console.error('[import/wb-weekly-report/detail]', error.message)
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

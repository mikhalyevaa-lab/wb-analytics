import { adminDb } from '@/lib/db-compat'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
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
  if (val == null || val === '') return null
  const v = Number(val)
  return isNaN(v) ? null : v
}

function str(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

// Маппинг заголовков колонок WB → поля БД
// Ключ — заголовок (lowercase, trimmed), значение — имя поля в wb_weekly_report_rows
const HEADER_MAP: Record<string, string> = {
  '№':                                                                         'row_number',
  'номер поставки':                                                            'supply_number',
  'предмет':                                                                   'subject',
  'код номенклатуры':                                                          'nm_id',
  'бренд':                                                                     'brand',
  'артикул поставщика':                                                        'supplier_article',
  'название':                                                                  'title',
  'размер':                                                                    'techsize',
  'баркод':                                                                    'barcode',
  'тип документа':                                                             'doc_type',
  'обоснование для оплаты':                                                    'payment_reason',
  'дата заказа покупателем':                                                   'order_date',
  'дата продажи':                                                              'sale_date',
  'кол-во':                                                                    'quantity',
  'цена розничная':                                                            'retail_price',
  'вайлдберриз реализовал товар (пр)':                                         'wb_sale_amount',
  'согласованный продуктовый дисконт, %':                                      'agreed_product_discount_pct',
  'промокод, %':                                                               'promo_code_pct',
  'итоговая согласованная скидка, %':                                          'total_agreed_discount_pct',
  'цена розничная с учетом согласованной скидки':                              'retail_price_with_discount',
  'размер снижения квв из-за рейтинга, %':                                     'kvv_rating_reduction_pct',
  'размер изменения квв из-за акции, %':                                       'kvv_promo_change_pct',
  'платформенные скидки, %':                                                   'platform_discounts_pct',
  'размер квв, %':                                                             'kvv_pct',
  'размер квв без ндс, % базовый':                                             'kvv_base_excl_vat_pct',
  'итоговый квв без ндс, %':                                                   'kvv_final_excl_vat_pct',
  'вознаграждение с продаж до вычета услуг поверенного, без ндс':              'commission_before_agent_excl_vat',
  'возмещение за выдачу и возврат товаров на пвз':                             'pvz_compensation',
  'компенсация платёжных услуг/комиссия за интеграцию платёжных сервисов':     'payment_service_compensation',
  'размер компенсации платёжных услуг/комиссии за интеграцию платёжных сервисов, %': 'payment_service_compensation_pct',
  'тип платежа: компенсация платёжных услуг/комиссия за интеграцию платёжных сервисов': 'payment_service_type',
  'вознаграждение вайлдберриз (вв), без ндс':                                  'wb_commission_excl_vat',
  'ндс с вознаграждения вайлдберриз':                                          'wb_commission_vat',
  'к перечислению продавцу за реализованный товар':                            'for_pay_seller',
  'количество доставок':                                                       'deliveries_count',
  'количество возврата':                                                       'returns_count',
  'услуги по доставке товара покупателю':                                      'delivery_service_cost',
  'дата начала действия фиксации':                                             'fix_start_date',
  'дата конца действия фиксации':                                              'fix_end_date',
  'признак услуги платной доставки':                                           'paid_delivery_flag',
  'общая сумма штрафов':                                                       'total_fines',
  'корректировка вознаграждения вайлдберриз (вв)':                             'wb_commission_correction',
  'виды логистики, штрафов и корректировок вв':                                'logistics_fines_types',
  'стикер мп':                                                                 'sticker',
  'наименование банка-эквайера':                                               'acquirer_bank',
  'номер офиса':                                                               'office_number',
  'наименование офиса доставки':                                               'office_name',
  'инн партнера':                                                              'partner_inn',
  'партнер':                                                                   'partner',
  'склад':                                                                     'warehouse',
  'страна':                                                                    'country',
  'тип коробов':                                                               'box_type',
  'номер таможенной декларации':                                               'customs_declaration_number',
  'номер сборочного задания':                                                  'assembly_task_number',
  'код маркировки':                                                            'marking_code',
  'шк':                                                                        'barcode_sticker',
  'srid':                                                                      'srid',
  'возмещение издержек по перевозке/по складским операциям с товаром':         'transport_compensation',
  'организатор перевозки':                                                     'transport_organizer',
  'хранение':                                                                  'row_storage_cost',
  'удержания':                                                                 'deductions',
  'операции на приемке':                                                       'acceptance_operations',
  'фиксированный коэффициент склада по поставке':                              'fixed_warehouse_coef',
  'признак продажи юридическому лицу':                                         'legal_entity_sale_flag',
  'номер короба для обработки товара':                                         'box_number',
  'скидка по программе софинансирования':                                      'cofinancing_discount',
  'скидка wibes, %':                                                           'wibes_discount_pct',
  'компенсация скидки по программе лояльности':                                'loyalty_discount_compensation',
  'стоимость участия в программе лояльности':                                  'loyalty_program_cost',
  'сумма баллов, удержанных по программе лояльности':                          'loyalty_points_deducted',
  'id корзины заказа':                                                         'basket_id',
  'разовое изменение срока перечисления денежных средств':                     'one_time_payment_change',
  'id собственной акции продавца с дополнительной скидкой':                   'seller_promo_id',
  'размер дополнительной скидки по собственной акции продавца, %':            'seller_promo_discount_pct',
  'способы продажи и тип товара':                                              'sale_method_type',
  'уникальный идентификатор скидки лояльности от продавца':                   'seller_loyalty_discount_id',
  'размер скидки лояльности от продавца, %':                                  'seller_loyalty_discount_pct',
  'id промокода':                                                              'promo_code_id',
  'скидка за промокод, %':                                                     'promo_code_discount_pct',
  'id подменного артикула':                                                    'substitution_article_id',
  'скидка по подменному артикулу, %':                                          'substitution_article_discount_pct',
  'оптовая скидка для бизнеса, %':                                             'wholesale_discount_pct',
  // Старые колонки (на случай загрузки старого формата)
  'код характеристики':                                                        'chrt_id',
  'тмц':                                                                       'tmc',
  'номер короба':                                                              'box_number',
}

// Поля, требующие преобразования типа
const DATE_FIELDS = new Set(['order_date', 'sale_date', 'fix_start_date', 'fix_end_date'])
const NUM_FIELDS = new Set([
  'nm_id', 'quantity', 'retail_price', 'wb_sale_amount',
  'agreed_product_discount_pct', 'promo_code_pct', 'total_agreed_discount_pct',
  'retail_price_with_discount', 'kvv_rating_reduction_pct', 'kvv_promo_change_pct',
  'platform_discounts_pct', 'kvv_pct', 'kvv_base_excl_vat_pct', 'kvv_final_excl_vat_pct',
  'commission_before_agent_excl_vat', 'pvz_compensation', 'payment_service_compensation',
  'payment_service_compensation_pct', 'wb_commission_excl_vat', 'wb_commission_vat',
  'for_pay_seller', 'deliveries_count', 'returns_count', 'delivery_service_cost',
  'total_fines', 'wb_commission_correction', 'transport_compensation', 'row_storage_cost',
  'deductions', 'acceptance_operations', 'chrt_id', 'fixed_warehouse_coef',
  'cofinancing_discount', 'wibes_discount_pct', 'loyalty_discount_compensation',
  'loyalty_program_cost', 'loyalty_points_deducted', 'one_time_payment_change',
  'seller_promo_discount_pct', 'seller_loyalty_discount_pct', 'promo_code_discount_pct',
  'substitution_article_discount_pct', 'wholesale_discount_pct',
])

export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
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

  // Номер отчёта из имени файла (внутри архива или из имени архива)
  const match = xlsxName.match(/№(\d+)/) ?? file.name.match(/№(\d+)/)
  let reportNumber = match ? Number(match[1]) : Number(reportNumberParam)
  if (!reportNumber) return NextResponse.json({ error: 'Cannot determine report number. Укажите его вручную.' }, { status: 400 })

  const wb = XLSX.read(xlsxBuf, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][]

  if (!raw.length) return NextResponse.json({ error: 'Пустой файл' }, { status: 400 })

  // Строим индекс колонок по заголовкам
  const headerRow = (raw[0] ?? []).map(h => String(h ?? '').trim().toLowerCase())
  const colIndex: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) {
    const dbField = HEADER_MAP[headerRow[i]]
    if (dbField) colIndex[dbField] = i
  }

  const unmappedHeaders = headerRow.filter(h => h && !HEADER_MAP[h])
  if (unmappedHeaders.length > 0) {
    console.warn('[wb-weekly-zip] Неизвестные колонки:', unmappedHeaders)
  }

  const adb = adminDb()
  const toUpsert: Record<string, unknown>[] = []
  const seenRowNums = new Set<number>()
  let skipped = 0

  for (const row of raw.slice(1)) {
    const rowNumRaw = colIndex['row_number'] != null ? row[colIndex['row_number']] : null
    const rowNum = n(rowNumRaw)
    if (rowNum == null) { skipped++; continue }
    if (seenRowNums.has(rowNum)) { skipped++; continue }
    seenRowNums.add(rowNum)

    const record: Record<string, unknown> = {
      store_id: storeId,
      report_number: reportNumber,
    }

    for (const [dbField, idx] of Object.entries(colIndex)) {
      const raw_val = row[idx]
      if (DATE_FIELDS.has(dbField)) {
        record[dbField] = parseDate(raw_val)
      } else if (NUM_FIELDS.has(dbField)) {
        record[dbField] = n(raw_val)
      } else {
        record[dbField] = str(raw_val)
      }
    }

    toUpsert.push(record)
  }

  let inserted = 0
  for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await adb.from('wb_weekly_report_rows').upsert(toUpsert.slice(i, i + CHUNK_SIZE) as any, { onConflict: 'store_id,report_number,row_number' })
    if (error) {
      console.error('[import/wb-weekly-report-zip]', error.message)
      return NextResponse.json({ ok: false, inserted, skipped, reportNumber, error: error.message })
    }
    inserted += toUpsert.slice(i, i + CHUNK_SIZE).length
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

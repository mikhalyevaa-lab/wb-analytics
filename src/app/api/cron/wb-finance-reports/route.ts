import { adminDb } from '@/lib/db-compat'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const WB_STATS_API = 'https://statistics-api.wildberries.ru'
const BATCH_SIZE = 500
const PAGE_LIMIT = 100000

interface WbReportRow {
  realizationreport_id: number
  date_from:                string
  date_to:                  string
  create_dt:                string
  rrd_id:                   number
  gi_id:                    number
  subject_name:             string
  nm_id:                    number
  brand_name:               string
  sa_name:                  string
  ts_name:                  string
  barcode:                  string
  doc_type_name:            string
  quantity:                 number
  retail_price:             number
  retail_amount:            number
  sale_percent:             number
  commission_percent:       number
  office_name:              string
  supplier_oper_name:       string
  order_dt:                 string
  sale_dt:                  string
  retail_price_withdisc_rub: number
  delivery_amount:          number
  return_amount:            number
  delivery_rub:             number
  ppvz_for_pay:             number
  ppvz_sales_commission:    number
  ppvz_office_id:           number
  ppvz_office_name:         string
  ppvz_supplier_id:         number
  ppvz_supplier_name:       string
  ppvz_inn:                 string
  declaration_number:       string
  sticker_id:               string
  site_country:             string
  penalty:                  number
  additional_payment:       number
  storage_fee:              number
  deduction:                number
  acceptance:               number
  srid:                     string
  kiz:                      string
}

// Загружает все строки отчёта за период, постранично по rrd_id
async function fetchReportRows(token: string, dateFrom: string, dateTo: string): Promise<WbReportRow[]> {
  const all: WbReportRow[] = []
  let rrdIdFrom = 0

  while (true) {
    const url = `${WB_STATS_API}/api/v5/supplier/reportDetailByPeriod?dateFrom=${dateFrom}&dateTo=${dateTo}&rrdid=${rrdIdFrom}&limit=${PAGE_LIMIT}`
    const res = await fetch(url, { headers: { Authorization: token } })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WB API ${res.status}: ${text.slice(0, 200)}`)
    }

    const rows: WbReportRow[] = await res.json()
    if (!rows?.length) break

    all.push(...rows)

    // Следующая страница начинается с rrd_id последней строки
    const lastRrd = rows[rows.length - 1]?.rrd_id
    if (!lastRrd || lastRrd <= rrdIdFrom || rows.length < PAGE_LIMIT) break
    rrdIdFrom = lastRrd

    if (all.length > 5_000_000) break // защита от бесконечного цикла
  }

  return all
}

function mapRow(storeId: string, r: WbReportRow): Record<string, unknown> {
  return {
    store_id:                  storeId,
    realizationreport_id:      r.realizationreport_id ?? null,
    date_from:                 r.date_from?.slice(0, 10) ?? null,
    date_to:                   r.date_to?.slice(0, 10) ?? null,
    create_dt:                 r.create_dt ?? null,
    rrd_id:                    r.rrd_id ?? null,
    gi_id:                     r.gi_id ?? null,
    subject_name:              r.subject_name ?? null,
    nm_id:                     r.nm_id ?? null,
    brand_name:                r.brand_name ?? null,
    sa_name:                   r.sa_name ?? null,
    ts_name:                   r.ts_name ?? null,
    barcode:                   r.barcode ?? null,
    doc_type_name:             r.doc_type_name ?? null,
    quantity:                  r.quantity ?? null,
    retail_price:              r.retail_price ?? null,
    retail_amount:             r.retail_amount ?? null,
    sale_percent:              r.sale_percent ?? null,
    commission_percent:        r.commission_percent ?? null,
    office_name:               r.office_name ?? null,
    supplier_oper_name:        r.supplier_oper_name ?? null,
    order_dt:                  r.order_dt ?? null,
    sale_dt:                   r.sale_dt ?? null,
    retail_price_withdisc_rub: r.retail_price_withdisc_rub ?? null,
    delivery_amount:           r.delivery_amount ?? null,
    return_amount:             r.return_amount ?? null,
    delivery_rub:              r.delivery_rub ?? null,
    ppvz_for_pay:              r.ppvz_for_pay ?? null,
    ppvz_sales_commission:     r.ppvz_sales_commission ?? null,
    ppvz_office_id:            r.ppvz_office_id ?? null,
    ppvz_office_name:          r.ppvz_office_name ?? null,
    ppvz_supplier_id:          r.ppvz_supplier_id ?? null,
    ppvz_supplier_name:        r.ppvz_supplier_name ?? null,
    ppvz_inn:                  r.ppvz_inn ?? null,
    declaration_number:        r.declaration_number ?? null,
    sticker_id:                r.sticker_id ?? null,
    site_country:              r.site_country ?? null,
    penalty:                   r.penalty ?? null,
    additional_payment:        r.additional_payment ?? null,
    storage_fee:               r.storage_fee ?? null,
    deduction:                 r.deduction ?? null,
    acceptance:                r.acceptance ?? null,
    srid:                      r.srid ?? null,
    kiz:                       r.kiz ?? null,
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  // Для ручного запуска можно передать dateFrom/dateTo явно
  const forceDateFrom = url.searchParams.get('dateFrom')
  const forceDateTo   = url.searchParams.get('dateTo')

  const adb = adminDb()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: storesRaw } = await (adb.from('stores') as any)
    .select('id, name, wb_token')
    .not('wb_token', 'is', null)
    .limit(50)

  const stores = (storesRaw ?? []) as { id: string; name: string; wb_token: string }[]
  if (!stores.length) return NextResponse.json({ ok: true, message: 'no stores' })

  const results: Record<string, { inserted: number; error?: string }> = {}

  for (const store of stores) {
    try {
      let dateFrom: string
      let dateTo: string

      if (forceDateFrom) {
        // Ручной запуск с явным периодом
        dateFrom = forceDateFrom
        dateTo = forceDateTo ?? new Date().toISOString().split('T')[0]
      } else {
        // Автоматика: с последней загруженной даты (с перекрытием -7 дней)
        const { data: lastRow } = await adb
          .from('wb_finance')
          .select('date_to')
          .eq('store_id', store.id)
          .order('date_to', { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastDate = (lastRow as { date_to: string | null } | null)?.date_to
        dateFrom = lastDate
          ? new Date(new Date(lastDate).getTime() - 7 * 86400000).toISOString().split('T')[0]
          : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
        dateTo = new Date().toISOString().split('T')[0]
      }

      console.log(`[wb-finance-reports] ${store.name}: ${dateFrom} → ${dateTo}`)

      const rows = await fetchReportRows(store.wb_token, dateFrom, dateTo)
      if (!rows.length) { results[store.name] = { inserted: 0 }; continue }

      const mapped = rows.map(r => mapRow(store.id, r))
      let inserted = 0

      for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
        const chunk = mapped.slice(i, i + BATCH_SIZE)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (adb.from('wb_finance') as any)
          .upsert(chunk, { onConflict: 'store_id,rrd_id' })
        if (error) throw new Error(error.message)
        inserted += chunk.length
      }

      results[store.name] = { inserted }
    } catch (err) {
      console.error(`[wb-finance-reports] ${store.name}:`, err)
      results[store.name] = { inserted: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return NextResponse.json({ ok: true, results })
}

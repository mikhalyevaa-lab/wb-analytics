import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserStoreIds } from '@/lib/queries'
import { adminDb } from '@/lib/admin'

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })

  const adb = adminDb()
  const today = new Date().toISOString().split('T')[0]

  const [
    missingCostRes,
    storeRes,
    ordersRes,
    salesRes,
    finRes,
    adRes,
    stocksRes,
    productsRes,
    funnelRes,
    storageRes,
    weeklyReportRes,
  ] = await Promise.all([
    // SKU без себестоимости
    adb.from('products')
      .select('nm_id, vendor_code, title, brand, photo_url, current_stock, avg_orders_per_day')
      .in('store_id', storeIds)
      .or('cost_price.is.null,cost_price.eq.0')
      .order('current_stock', { ascending: false })
      .limit(200),

    // Токен аналитики
    adb.from('stores')
      .select('name, wb_analytics_token, updated_at')
      .in('id', storeIds)
      .limit(1)
      .single(),

    // Последний день с заказами
    adb.from('wb_orders')
      .select('date, last_change_date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с продажами (выкупами)
    adb.from('wb_sales')
      .select('date, last_change_date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с финансами
    adb.from('wb_finance')
      .select('date_from')
      .in('store_id', storeIds)
      .order('date_from', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с данными рекламы
    adb.from('wb_ad_spend')
      .select('date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с остатками — прямо из таблицы
    adb.from('wb_stocks')
      .select('date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последнее обновление справочника товаров
    adb.from('products')
      .select('updated_at')
      .in('store_id', storeIds)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с данными воронки
    adb.from('wb_funnel')
      .select('date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последний день с данными платного хранения
    (adb.from('wb_storage_daily') as any)
      .select('date')
      .in('store_id', storeIds)
      .order('date', { ascending: false })
      .limit(1)
      .single(),

    // Последний финансовый отчёт WB
    adb.from('wb_weekly_reports')
      .select('date_to, reconciled, reconciled_at')
      .in('store_id', storeIds)
      .order('date_to', { ascending: false })
      .limit(1)
      .single(),
  ])

  type ProductRow  = { nm_id: number | null; vendor_code: string | null; title: string | null; brand: string | null; photo_url: string | null; current_stock: number | null; avg_orders_per_day: number | null }
  type StoreRow    = { name: string | null; wb_analytics_token: string | null; updated_at: string | null }
  type DateRow     = { date: string | null; last_change_date?: string | null }
  type FinDateRow  = { date_from: string | null }
  type ProdDateRow = { updated_at: string | null }

  const missingCostProducts = (missingCostRes.data ?? []) as ProductRow[]
  const storeData           = storeRes.data      as StoreRow    | null
  const ordersRow           = ordersRes.data     as DateRow     | null
  const salesRow            = salesRes.data      as DateRow     | null
  const lastOrdersDate      = ordersRow?.date?.slice(0, 10)   ?? null
  const lastOrdersAt        = ordersRow?.last_change_date      ?? null
  const lastSalesDate       = salesRow?.date?.slice(0, 10)    ?? null
  const lastSalesAt         = salesRow?.last_change_date       ?? null
  const lastFinanceDate     = (finRes.data       as FinDateRow  | null)?.date_from?.slice(0, 10) ?? null
  const lastAdDate          = (adRes.data        as DateRow     | null)?.date?.slice(0, 10)   ?? null
  const lastStocksDate      = (stocksRes.data    as DateRow     | null)?.date?.slice(0, 10)   ?? null
  const lastProductsAt      = (productsRes.data  as ProdDateRow | null)?.updated_at            ?? null
  const lastProductsDate    = lastProductsAt?.slice(0, 10) ?? null
  const lastFunnelDate      = (funnelRes.data    as DateRow     | null)?.date?.slice(0, 10)   ?? null
  const lastStorageDate     = (storageRes.data   as DateRow     | null)?.date?.slice(0, 10)   ?? null
  type WeeklyReportRow = { date_to: string | null; reconciled: boolean | null; reconciled_at: string | null }
  const weeklyReportData = weeklyReportRes.data as WeeklyReportRow | null
  const lastWeeklyReportDate = weeklyReportData?.date_to?.slice(0, 10) ?? null
  const lastReconciledAt = weeklyReportData?.reconciled ? weeklyReportData.reconciled_at?.slice(0, 10) ?? null : null

  function daysSince(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null
    const diff = new Date(today).getTime() - new Date(dateStr.slice(0, 10)).getTime()
    return Math.round(diff / 86400000)
  }

  const DATA_SOURCES = [
    { key: 'orders',   label: 'Заказы',            lastDate: lastOrdersDate,   lastUpdatedAt: lastOrdersAt,   warnDays: 2 },
    { key: 'sales',    label: 'Продажи (выкупы)',  lastDate: lastSalesDate,    lastUpdatedAt: lastSalesAt,    warnDays: 2 },
    { key: 'finance',  label: 'Финансы',            lastDate: lastFinanceDate,  lastUpdatedAt: null,           warnDays: 7 },
    { key: 'ad_spend', label: 'Реклама',            lastDate: lastAdDate,       lastUpdatedAt: null,           warnDays: 7 },
    { key: 'stocks',   label: 'Остатки',            lastDate: lastStocksDate,   lastUpdatedAt: null,           warnDays: 1 },
    { key: 'products', label: 'Справочник товаров', lastDate: lastProductsDate, lastUpdatedAt: lastProductsAt, warnDays: 3 },
    { key: 'funnel',   label: 'Воронка продаж',    lastDate: lastFunnelDate,   lastUpdatedAt: null,           warnDays: 3 },
    { key: 'storage',  label: 'Платное хранение',  lastDate: lastStorageDate,  lastUpdatedAt: null,           warnDays: 3 },
    { key: 'weekly_report', label: 'Финансы (еженедельный отчёт)', lastDate: lastWeeklyReportDate, lastUpdatedAt: null, warnDays: 14 },
  ].map(s => ({
    ...s,
    daysSince: daysSince(s.lastDate),
    status: (() => {
      const d = daysSince(s.lastDate)
      if (d == null) return 'missing'
      if (d <= s.warnDays) return 'ok'
      if (d <= s.warnDays * 3) return 'warn'
      return 'error'
    })() as 'ok' | 'warn' | 'error' | 'missing',
  }))

  const issues = [
    missingCostProducts.length > 0 && `${missingCostProducts.length} SKU без себестоимости`,
    !storeData?.wb_analytics_token && 'Не подключён wb_analytics_token',
    DATA_SOURCES.some(s => s.status === 'error' || s.status === 'missing') && 'Данные устарели',
  ].filter(Boolean) as string[]

  return NextResponse.json({
    issues,
    missingCostProducts,
    hasToken: !!storeData?.wb_analytics_token,
    storeName: storeData?.name ?? '',
    dataSources: DATA_SOURCES,
    today,
    weeklyReport: {
      lastDate: lastWeeklyReportDate,
      lastReconciledAt,
    },
  })
}

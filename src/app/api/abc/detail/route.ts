import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  const { searchParams } = new URL(req.url)
  const nmId     = Number(searchParams.get('nm_id'))
  const dateFrom = searchParams.get('from') || '2000-01-01'
  const dateTo   = searchParams.get('to')   || '2099-12-31'
  if (!nmId) return NextResponse.json({ error: 'nm_id required' }, { status: 400 })

  try {
    // Настройки магазина
    const settingsRows = await db`
      SELECT usn_tax_pct, vat_pct FROM store_settings WHERE store_id = ${storeId} LIMIT 1
    `
    const usnPct = Number(settingsRows[0]?.usn_tax_pct ?? 6)
    const vatPct = Number(settingsRows[0]?.vat_pct     ?? 0)

    // Товар (дата пустого склада вычисляется из avg_orders_per_day)
    const productRows = await db`
      SELECT cost_price, current_stock, avg_orders_per_day,
        CASE
          WHEN avg_orders_per_day > 0
          THEN (CURRENT_DATE + (current_stock / avg_orders_per_day * INTERVAL '1 day'))::date
          ELSE NULL
        END AS empty_date
      FROM products
      WHERE nm_id = ${nmId} AND store_id = ${storeId}
      LIMIT 1
    `
    const costPriceUnit = productRows[0]?.cost_price    != null ? Number(productRows[0].cost_price)    : null
    const currentStock  = productRows[0]?.current_stock != null ? Number(productRows[0].current_stock) : 0
    const emptyDate     = productRows[0]?.empty_date    ?? null

    // Агрегаты из wb_finance по sale_dt
    const finRows = await db`
      SELECT
        COALESCE(SUM(retail_amount), 0)                                          AS revenue_before_spp,
        COALESCE(SUM(ppvz_for_pay), 0)                                           AS revenue_after_spp,
        COALESCE(ABS(SUM(ppvz_sales_commission)), 0)                             AS commission,
        COALESCE(SUM(CASE WHEN delivery_rub > 0 THEN delivery_rub ELSE 0 END), 0) AS logistics,
        COALESCE(ABS(SUM(penalty)), 0)                                           AS penalty
      FROM wb_finance
      WHERE nm_id    = ${nmId}
        AND store_id = ANY(${storeIds})
        AND sale_dt >= ${dateFrom}
        AND sale_dt <= ${dateTo + 'T23:59:59'}
    `
    const fin = finRows[0]
    const revenueBeforeSpp = Number(fin?.revenue_before_spp ?? 0) || null
    const revenueAfterSpp  = Number(fin?.revenue_after_spp  ?? 0) || null
    const commission       = Number(fin?.commission ?? 0)
    const logistics        = Number(fin?.logistics  ?? 0)
    const penalty          = Number(fin?.penalty    ?? 0)

    // Хранение из wb_storage_daily (wb_finance.storage_fee обычно 0)
    const storageRows = await db`
      SELECT COALESCE(SUM(cost), 0) AS total
      FROM wb_storage_daily
      WHERE nm_id    = ${nmId}
        AND store_id = ANY(${storeIds})
        AND date    >= ${dateFrom}
        AND date    <= ${dateTo}
    `
    const storage = Number(storageRows[0]?.total ?? 0)

    // Реклама из wb_ad_spend_nm (привязка к nm_id)
    const adRows = await db`
      SELECT COALESCE(SUM(spend), 0) AS total
      FROM wb_ad_spend_nm
      WHERE nm_id    = ${nmId}
        AND store_id = ANY(${storeIds})
        AND date    >= ${dateFrom}
        AND date    <= ${dateTo}
    `
    const adSpend = Number(adRows[0]?.total ?? 0)

    // Кол-во выкупов за период
    const salesRows = await db`
      SELECT COUNT(*) AS cnt
      FROM wb_sales
      WHERE nm_id          = ${nmId}
        AND store_id       = ANY(${storeIds})
        AND is_realization = true
        AND date          >= ${dateFrom}
        AND date          <= ${dateTo + 'T23:59:59'}
    `
    const soldQty = Number(salesRows[0]?.cnt ?? 0)

    const costTotal = costPriceUnit != null ? costPriceUnit * soldQty : null
    const defect    = costTotal != null ? costTotal * 0.01 : null

    // НДС = Выручка / (1 + НДС%) × НДС%
    const vatAmount = revenueAfterSpp != null && vatPct > 0
      ? revenueAfterSpp / (1 + vatPct / 100) * (vatPct / 100)
      : null

    // УСН = (Выручка после СПП − НДС) × ставка УСН
    const usnAmount = revenueAfterSpp != null
      ? (revenueAfterSpp - (vatAmount ?? 0)) * (usnPct / 100)
      : null

    // Чистая прибыль (включает рекламу)
    let netProfit: number | null = null
    if (revenueAfterSpp != null && costTotal != null) {
      netProfit = revenueAfterSpp - costTotal - commission - logistics - storage
        - adSpend - (usnAmount ?? 0) - (vatAmount ?? 0) - (defect ?? 0) - penalty
    }

    const marginPct = revenueAfterSpp && revenueAfterSpp > 0 && netProfit != null
      ? (netProfit / revenueAfterSpp) * 100 : null
    const roi       = costTotal && costTotal > 0 && netProfit != null
      ? (netProfit / costTotal) * 100 : null

    // Точка безубыточности — всего и на 1 шт
    const breakEven     = (costTotal ?? 0) + commission + logistics + storage
      + adSpend + (usnAmount ?? 0) + (vatAmount ?? 0) + (defect ?? 0) + penalty
    const breakEvenUnit = soldQty > 0 ? breakEven / soldQty : null

    // Прибыль на 1 шт
    const netProfitUnit = netProfit != null && soldQty > 0 ? netProfit / soldQty : null

    return NextResponse.json({
      revenue_before_spp: revenueBeforeSpp,
      spp_amount:         revenueBeforeSpp != null && revenueAfterSpp != null
        ? revenueBeforeSpp - revenueAfterSpp : null,
      revenue_after_spp:  revenueAfterSpp,
      cost_price_unit:    costPriceUnit,
      cost_total:         costTotal,
      sold_qty:           soldQty,
      commission,
      logistics,
      storage,
      ad_spend:           adSpend,
      penalty,
      usn_amount:         usnAmount,
      usn_pct:            usnPct,
      vat_amount:         vatAmount,
      vat_pct:            vatPct,
      defect,
      net_profit:         netProfit,
      net_profit_unit:    netProfitUnit,
      margin_pct:         marginPct,
      roi_pct:            roi,
      break_even:         breakEven,
      break_even_unit:    breakEvenUnit,
      current_stock:      currentStock,
      empty_date:         emptyDate,
    })
  } catch (e) {
    console.error('[abc/detail]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

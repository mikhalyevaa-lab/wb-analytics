import { db } from './db'

export interface OverviewFinance {
  revenue: number; cost: number; commission: number; logistics: number
  returns: number; penalties: number; additional: number; netProfit: number
  netPayable: number; margin: number; roi: number; unitCount: number
  profitPerUnit: number; buyoutRate: number
}
export interface Insights {
  worstProduct:    { nm_id: number; title: string; profit: number } | null
  bestProduct:     { nm_id: number; title: string; profit: number } | null
  bestRoi:         { nm_id: number; title: string; roi: number } | null
  highDrrCampaign: { campaign_id: number; campaign_name: string | null; drr: number; spend: number } | null
  emptyStockSoon:  { nm_id: number; title: string; days: number } | null
  returnsAmount: number; returnsShare: number; buyoutRate: number
}
export interface YesterdayOrders {
  count: number; revenue: number; countPrevWeek: number; delta: number
}
export interface StocksAlert {
  nm_id: number; title: string; photo_url: string | null; days_of_stock: number
}
export interface StocksAlerts { critical: StocksAlert[]; soon: StocksAlert[] }
export interface DataQualityAlerts { missingCost: number; missingToken: boolean }

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export async function getOverviewFinance(storeIds: string[], dateFrom: string, dateTo: string): Promise<OverviewFinance> {
  if (!storeIds.length) return { revenue:0,cost:0,commission:0,logistics:0,returns:0,penalties:0,additional:0,netProfit:0,netPayable:0,margin:0,roi:0,unitCount:0,profitPerUnit:0,buyoutRate:0 }

  const [finRows, dirRows, costRows] = await Promise.all([
    db<{nm_id:number,doc_type_name:string,quantity:number,ppvz_for_pay:number,delivery_rub:number,penalty:number,additional_payment:number}[]>`
      SELECT nm_id, doc_type_name, COALESCE(quantity,0) quantity, COALESCE(ppvz_for_pay,0) ppvz_for_pay,
             COALESCE(delivery_rub,0) delivery_rub, COALESCE(penalty,0) penalty, COALESCE(additional_payment,0) additional_payment
      FROM wb_finance WHERE store_id=ANY(${storeIds}) AND date_from>=${dateFrom}::date AND date_from<=${dateTo}::date`,
    db<{doc_type_name:string,multiplier:number}[]>`SELECT doc_type_name, multiplier FROM directory`,
    db<{nm_id:number,cost_price:number}[]>`SELECT nm_id, COALESCE(cost_price,0) cost_price FROM products WHERE store_id=ANY(${storeIds})`,
  ])

  const multMap = new Map(dirRows.map(d => [d.doc_type_name, Number(d.multiplier)]))
  const costMap = new Map(costRows.map(p => [p.nm_id, Number(p.cost_price)]))

  let revenue=0,returns=0,logistics=0,penalties=0,additional=0,cost=0,unitCount=0,salesUnits=0,returnUnits=0
  for (const r of finRows) {
    const mult = multMap.get(r.doc_type_name) ?? 0
    const pay = Number(r.ppvz_for_pay)
    const qty = Number(r.quantity)
    if (mult===1)  { revenue+=pay; unitCount+=qty; salesUnits+=qty; cost+=(costMap.get(r.nm_id)??0)*qty }
    if (mult===-1) { returns+=Math.abs(pay); returnUnits+=qty }
    logistics += Math.abs(Number(r.delivery_rub))
    penalties += Math.abs(Number(r.penalty))
    additional += Number(r.additional_payment)
  }
  const buyoutRate = (salesUnits+returnUnits)>0 ? salesUnits/(salesUnits+returnUnits)*100 : 0
  const netPayable = revenue-returns-logistics-penalties+additional
  const netProfit  = netPayable-cost
  const margin = revenue>0 ? netProfit/revenue*100 : 0
  const roi    = cost>0    ? netProfit/cost*100    : 0
  return { revenue:Math.round(revenue), cost:Math.round(cost), commission:0, logistics:Math.round(logistics), returns:Math.round(returns), penalties:Math.round(penalties), additional:Math.round(additional), netProfit:Math.round(netProfit), netPayable:Math.round(netPayable), margin:Math.round(margin*10)/10, roi:Math.round(roi*10)/10, unitCount, profitPerUnit:Math.round(unitCount>0?netProfit/unitCount:0), buyoutRate:Math.round(buyoutRate*10)/10 }
}

export async function getInsights(storeIds: string[], dateFrom: string, dateTo: string): Promise<Insights> {
  if (!storeIds.length) return { worstProduct:null, bestProduct:null, bestRoi:null, highDrrCampaign:null, emptyStockSoon:null, returnsAmount:0, returnsShare:0, buyoutRate:0 }

  const [finRows, dirRows, prodRows, adCamp, stockAlerts] = await Promise.all([
    db<{nm_id:number,doc_type_name:string,ppvz_for_pay:number,delivery_rub:number,penalty:number,quantity:number}[]>`
      SELECT nm_id, doc_type_name, COALESCE(ppvz_for_pay,0) ppvz_for_pay, COALESCE(delivery_rub,0) delivery_rub, COALESCE(penalty,0) penalty, COALESCE(quantity,0) quantity
      FROM wb_finance WHERE store_id=ANY(${storeIds}) AND date_from>=${dateFrom}::date AND date_from<=${dateTo}::date LIMIT 100000`,
    db<{doc_type_name:string,multiplier:number}[]>`SELECT doc_type_name, multiplier FROM directory`,
    db<{nm_id:number,title:string,cost_price:number}[]>`SELECT nm_id, COALESCE(title,vendor_code::text,'') title, COALESCE(cost_price,0) cost_price FROM products WHERE store_id=ANY(${storeIds})`,
    db<{campaign_id:number,campaign_name:string,spend:number,orders_sum:number}[]>`
      SELECT campaign_id, campaign_name, COALESCE(SUM(spend),0) spend, COALESCE(SUM(orders_sum),0) orders_sum
      FROM wb_ad_spend WHERE store_id=ANY(${storeIds}) AND "date">=${dateFrom}::date AND "date"<=${dateTo}::date
      GROUP BY campaign_id, campaign_name HAVING SUM(spend)>500`,
    db<{nm_id:number,title:string,current_stock:number,avg_orders_per_day:number}[]>`
      SELECT nm_id, COALESCE(title,vendor_code::text,'') title, current_stock, avg_orders_per_day
      FROM products WHERE store_id=ANY(${storeIds}) AND current_stock>0 AND avg_orders_per_day>0`,
  ])

  const multMap = new Map(dirRows.map(d => [d.doc_type_name, Number(d.multiplier)]))
  const prodMap = new Map(prodRows.map(p => [p.nm_id, p]))

  const nmMap = new Map<number,{revenue:number,returns:number,logistics:number,penalties:number,units:number}>()
  let totalRevenue=0, totalReturns=0, salesUnits=0, returnUnits=0
  for (const r of finRows) {
    if (!r.nm_id) continue
    const mult = multMap.get(r.doc_type_name)??0
    const pay = Number(r.ppvz_for_pay), qty=Number(r.quantity)
    const cur = nmMap.get(r.nm_id)??{revenue:0,returns:0,logistics:0,penalties:0,units:0}
    if (mult===1)  { cur.revenue+=pay; cur.units+=qty; totalRevenue+=pay; salesUnits+=qty }
    if (mult===-1) { cur.returns+=Math.abs(pay); totalReturns+=Math.abs(pay); returnUnits+=qty }
    cur.logistics+=Math.abs(Number(r.delivery_rub))
    cur.penalties+=Math.abs(Number(r.penalty))
    nmMap.set(r.nm_id, cur)
  }

  const profitRows = [...nmMap.entries()].map(([nm_id,v]) => {
    const p = prodMap.get(nm_id)
    const cost = (p?.cost_price??0)*v.units
    const profit = v.revenue-v.returns-v.logistics-v.penalties-cost
    const roi = cost>0 ? profit/cost*100 : null
    return { nm_id, title:p?.title??String(nm_id), profit, roi, revenue:v.revenue }
  }).filter(r=>r.revenue>0).sort((a,b)=>a.profit-b.profit)

  const worst = profitRows[0]??null
  const best  = profitRows[profitRows.length-1]??null
  const roiRows = profitRows.filter(r=>r.roi!==null).sort((a,b)=>(b.roi??0)-(a.roi??0))
  const bestRoiRow = roiRows[0]??null

  const highDrrCampaign = adCamp
    .map(c => ({ ...c, spend:Number(c.spend), orders_sum:Number(c.orders_sum), drr:Number(c.orders_sum)>0?Number(c.spend)/Number(c.orders_sum)*100:0 }))
    .sort((a,b)=>b.drr-a.drr)
    .find(c=>c.drr>25) ?? null

  const emptyStockSoon = stockAlerts
    .map(r=>({nm_id:r.nm_id,title:r.title,days:Math.floor(Number(r.current_stock)/Number(r.avg_orders_per_day))}))
    .filter(r=>r.days<15&&r.days>0)
    .sort((a,b)=>a.days-b.days)[0]??null

  const buyoutRate = (salesUnits+returnUnits)>0 ? salesUnits/(salesUnits+returnUnits)*100 : 0
  return { worstProduct:worst?{nm_id:worst.nm_id,title:worst.title,profit:Math.round(worst.profit)}:null, bestProduct:best?{nm_id:best.nm_id,title:best.title,profit:Math.round(best.profit)}:null, bestRoi:bestRoiRow?{nm_id:bestRoiRow.nm_id,title:bestRoiRow.title,roi:Math.round(bestRoiRow.roi??0)}:null, highDrrCampaign:highDrrCampaign?{campaign_id:highDrrCampaign.campaign_id,campaign_name:highDrrCampaign.campaign_name,drr:Math.round(highDrrCampaign.drr*10)/10,spend:Math.round(highDrrCampaign.spend)}:null, emptyStockSoon, returnsAmount:Math.round(totalReturns), returnsShare:totalRevenue>0?Math.round(totalReturns/totalRevenue*1000)/10:0, buyoutRate:Math.round(buyoutRate*10)/10 }
}

export async function getYesterdayOrders(storeIds: string[]): Promise<YesterdayOrders> {
  if (!storeIds.length) return { count:0, revenue:0, countPrevWeek:0, delta:0 }
  const yesterday = daysAgo(1)
  const prevWeekDay = daysAgo(8)

  const [cur, prev] = await Promise.all([
    db<{count:number,revenue:number}[]>`
      SELECT COUNT(*) count, COALESCE(SUM(total_price*(1-COALESCE(discount_percent,0)/100)),0) revenue
      FROM wb_orders WHERE store_id=ANY(${storeIds}) AND is_cancel=false AND "date"::"date"=${yesterday}::date`,
    db<{count:number}[]>`
      SELECT COUNT(*) count FROM wb_orders WHERE store_id=ANY(${storeIds}) AND is_cancel=false AND "date"::"date"=${prevWeekDay}::date`,
  ])
  const count=Number(cur[0].count), countPrevWeek=Number(prev[0].count)
  return { count, revenue:Math.round(Number(cur[0].revenue)), countPrevWeek, delta:count-countPrevWeek }
}

export async function getStocksAlerts(storeIds: string[]): Promise<StocksAlerts> {
  if (!storeIds.length) return { critical:[], soon:[] }

  const rows = await db<{nm_id:number,title:string,photo_url:string,days_of_stock:number}[]>`
    SELECT p.nm_id, COALESCE(p.title,p.vendor_code::text,'') title, p.photo_url,
           ROUND(COALESCE(SUM(s.quantity_full),0) / NULLIF(p.avg_orders_per_day,0)) days_of_stock
    FROM products p
    LEFT JOIN wb_stocks s ON s.nm_id=p.nm_id AND s.store_id=ANY(${storeIds})
    WHERE p.store_id=ANY(${storeIds}) AND p.avg_orders_per_day>0
    GROUP BY p.nm_id, p.title, p.vendor_code, p.photo_url, p.avg_orders_per_day
    HAVING ROUND(COALESCE(SUM(s.quantity_full),0)/NULLIF(p.avg_orders_per_day,0)) < 21
    ORDER BY days_of_stock LIMIT 20`

  const critical = rows.filter(r=>Number(r.days_of_stock)<14).map(r=>({nm_id:r.nm_id,title:r.title,photo_url:r.photo_url??null,days_of_stock:Number(r.days_of_stock)})).slice(0,10)
  const soon     = rows.filter(r=>Number(r.days_of_stock)>=14).map(r=>({nm_id:r.nm_id,title:r.title,photo_url:r.photo_url??null,days_of_stock:Number(r.days_of_stock)})).slice(0,10)
  return { critical, soon }
}

export async function getDataQualityAlerts(storeIds: string[]): Promise<DataQualityAlerts> {
  if (!storeIds.length) return { missingCost:0, missingToken:false }
  const [countRow, storeRow] = await Promise.all([
    db<{c:number}[]>`SELECT COUNT(*) c FROM products WHERE store_id=ANY(${storeIds}) AND (cost_price IS NULL OR cost_price=0)`,
    db<{wb_analytics_token:string|null}[]>`SELECT wb_analytics_token FROM stores WHERE id=ANY(${storeIds}) LIMIT 1`,
  ])
  return { missingCost:Number(countRow[0].c), missingToken:!storeRow[0]?.wb_analytics_token }
}

export async function getOverviewDailySales(storeIds: string[]) {
  if (!storeIds.length) return []
  const rows = await db<{date:string,orders:number,revenue:number}[]>`
    SELECT "date"::"date"::text date, COUNT(*) orders,
           COALESCE(SUM(total_price*(1-COALESCE(discount_percent,0)/100)),0) revenue
    FROM wb_orders
    WHERE store_id=ANY(${storeIds}) AND is_cancel=false AND "date">=NOW()-INTERVAL '28 days'
    GROUP BY 1 ORDER BY 1`
  return rows.map(r=>({date:r.date,orders:Number(r.orders),revenue:Math.round(Number(r.revenue))}))
}

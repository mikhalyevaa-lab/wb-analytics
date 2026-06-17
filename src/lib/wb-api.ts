/**
 * WB Analytics — Клиент Wildberries API
 * Документация: https://dev.wildberries.ru/docs
 */

const WB_STATS_URL = 'https://statistics-api.wildberries.ru'
const WB_CONTENT_URL = 'https://content-api.wildberries.ru'
const WB_ADV_URL = 'https://advert-api.wildberries.ru'

// ---------- Типы данных ----------

export interface WBOrder {
  date: string
  lastChangeDate: string
  supplierArticle: string
  techSize: string
  barcode: string
  totalPrice: number
  discountPercent: number
  warehouseName: string
  oblast: string
  incomeID: number
  odid: number
  nmId: number
  subject: string
  category: string
  brand: string
  isCancel: boolean
  cancel_dt: string
  sticker: string
  gNumber: string
  srid: string
}

export interface WBSale {
  date: string
  lastChangeDate: string
  supplierArticle: string
  techSize: string
  barcode: string
  totalPrice: number
  discountPercent: number
  isSupply: boolean
  isRealization: boolean
  totalPaymentSum: number
  warehouseName: string
  oblast: string
  incomeID: number
  odid: number
  saleID: string
  uniqueID: string
  nmId: number
  subject: string
  category: string
  brand: string
  IsStorno: number
  promoCodeDiscount: number
  countryName: string
  oblastOkrugName: string
  regionName: string
  forPay: number
  finishedPrice: number
  priceWithDisc: number
  srid: string
}

export interface WBStock {
  lastChangeDate: string
  supplierArticle: string
  techSize: string
  barcode: string
  quantity: number
  isSupply: boolean
  isRealization: boolean
  quantityFull: number
  quantityNotInOrders: number
  warehouseName: string
  inWayToClient: number
  inWayFromClient: number
  nmId: number
  subject: string
  category: string
  brand: string
  SCCode: string
  Price: number
  Discount: number
  daysOnSite: number
}

export interface WBFinanceRow {
  realizationreport_id: number
  date_from: string
  date_to: string
  nm_id: number
  sa_name: string
  ts_name: string
  barcode: string
  doc_type_name: string
  quantity: number
  retail_price: number
  retail_amount: number
  sale_percent: number
  commission_percent: number
  retail_price_withdisc: number
  delivery_amount: number
  return_amount: number
  delivery_rub: number
  ppvz_for_pay: number
  ppvz_vw: number
  ppvz_vw_nds: number
  ppvz_office_name: string
  ppvz_supplier_id: number
  penalty: number
  additional_payment: number
  rrd_id: number
  order_dt: string
  office_name: string
  supplier_oper_name: string
}

export interface WBAdSpend {
  updNum: string
  updTime: string
  updSum: number
  advertId: number
  campName: string
  advertType: number
  paymentType: string
  status: number
  days: Array<{
    date: string
    apps: Array<{
      appType: number
      nm: Array<{
        nmId: number
        views: number
        clicks: number
        frq: number
        ctr: number
        sum: number
        atbs: number
        orders: number
        cr: number
        shks: number
        sum_price: number
      }>
    }>
  }>
}

// ---------- Базовый клиент ----------

class WBApiClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`WB API Error ${response.status}: ${errorText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Получить заказы за период
   * @param dateFrom - дата начала в формате 'YYYY-MM-DDTHH:mm:ss'
   * @param flag - 0 = только новые, 1 = все за период
   */
  async getOrders(dateFrom: string, flag: 0 | 1 = 0): Promise<WBOrder[]> {
    const url = `${WB_STATS_URL}/api/v1/supplier/orders?dateFrom=${dateFrom}&flag=${flag}`
    return this.fetch<WBOrder[]>(url)
  }

  /**
   * Получить продажи (выкупы) за период
   */
  async getSales(dateFrom: string, flag: 0 | 1 = 0): Promise<WBSale[]> {
    const url = `${WB_STATS_URL}/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=${flag}`
    return this.fetch<WBSale[]>(url)
  }

  /**
   * Получить остатки на складах WB
   * @param dateFrom - дата последнего изменения (обычно вчера)
   */
  async getStocks(dateFrom: string): Promise<WBStock[]> {
    const url = `${WB_STATS_URL}/api/v1/supplier/stocks?dateFrom=${dateFrom}`
    return this.fetch<WBStock[]>(url)
  }

  /**
   * Получить финансовый отчёт за период
   * Содержит: комиссии WB, логистика, штрафы, выплаты
   */
  async getFinanceReport(
    dateFrom: string,
    dateTo: string,
    rrdid: number = 0,
    limit: number = 100000
  ): Promise<WBFinanceRow[]> {
    const url = `${WB_STATS_URL}/api/v5/supplier/reportDetailByPeriod`
      + `?dateFrom=${dateFrom}&dateTo=${dateTo}&rrdid=${rrdid}&limit=${limit}`
    return this.fetch<WBFinanceRow[]>(url)
  }

  /**
   * Получить расходы на рекламу
   * @param dateFrom - дата начала YYYY-MM-DD
   * @param dateTo - дата окончания YYYY-MM-DD
   */
  async getAdSpend(dateFrom: string, dateTo: string): Promise<WBAdSpend[]> {
    const url = `${WB_ADV_URL}/adv/v1/upd?dateFrom=${dateFrom}&dateTo=${dateTo}`
    return this.fetch<WBAdSpend[]>(url)
  }
}

// ---------- Хелперы ----------

/**
 * Создать клиент WB API для конкретного магазина
 */
export function createWBClient(apiKey: string): WBApiClient {
  return new WBApiClient(apiKey)
}

/**
 * Форматировать дату для WB API
 */
export function formatDateForWB(date: Date): string {
  return date.toISOString().replace('Z', '')
}

/**
 * Получить дату N дней назад
 */
export function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Рассчитать % выкупа (buyout rate)
 */
export function calcBuyoutRate(sales: number, orders: number): number {
  if (orders === 0) return 0
  return Math.round((sales / orders) * 100)
}

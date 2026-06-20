/**
 * WB Analytics — Клиент Wildberries API
 * Документация: https://dev.wildberries.ru/docs
 */

const WB_STATS_URL     = 'https://statistics-api.wildberries.ru'
const WB_CONTENT_URL   = 'https://content-api.wildberries.ru'
const WB_ADV_URL       = 'https://advert-api.wildberries.ru'
const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru'

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
  spp: number
  gNumber: string
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

export interface WBIncome {
  incomeId: number
  date: string
  lastChangeDate: string
  supplierArticle: string
  techSize: string
  barcode: string
  quantity: number
  totalPrice: number
  dateClose: string
  warehouseName: string
  nmId: number
  status: string
}

export interface WBAdCampaign {
  advertId: number
  name: string
  type: number
  status: number
  dailyBudget: number
  createTime: string
  changeTime: string
  startTime: string
  endTime: string
}

export interface WBAdSpendFull {
  advertId: number
  begin: string
  end: string
  nm: Array<{
    nmId: number
    name: string
    views: number
    clicks: number
    ctr: number
    cpc: number
    sum: number
    atbs: number
    orders: number
    cr: number
    shks: number
    sum_price: number
  }>
}

export interface WBProduct {
  nmID: number
  imtID: number
  vendorCode: string
  brand: string
  title: string
  description: string
  photos: Array<{ big: string; c246x328: string }>
  video: string
  dimensions: { length: number; width: number; height: number; isValid: boolean }
  characteristics: Array<{ id: number; name: string; value: string[] }>
  sizes: Array<{
    chrtID: number
    techSize: string
    wbSize: string
    skus: string[]
    price: number
    discountedPrice: number
  }>
  tags: Array<{ id: number; name: string; color: string }>
  createdAt: string
  updatedAt: string
  subjectID: number
  subjectName: string
}

export interface WBAdSpend {
  updNum: string
  updTime: string | null
  updSum: number
  advertId: number
  campName: string
  advertType: number
  paymentType: string
  advertStatus: number
}

// /adv/v3/fullstats response
export interface WBAdStatDay {
  date: string
  views: number
  clicks: number
  ctr: number
  orders: number
  sum: number       // spend
  sum_price: number // orders sum
  shks: number
  atbs: number
}

export interface WBAdStatCampaign {
  advertId: number
  views: number
  clicks: number
  ctr: number
  orders: number
  sum: number
  sum_price: number
  shks: number
  atbs: number
  days: WBAdStatDay[]
}

// ---------- Воронка продаж ----------

export interface WBFunnelDay {
  date: string
  openCount: number
  cartCount: number
  orderCount: number
  orderSum: number
  buyoutCount: number
  buyoutSum: number
  buyoutPercent: number
  addToCartConversion: number
  cartToOrderConversion: number
  addToWishlistCount: number
}

export interface WBFunnelItem {
  product: {
    nmId: number
    vendorCode: string
  }
  history: WBFunnelDay[]
}

// ---------- Базовый клиент ----------

const MAX_RETRIES = 4

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

class WBApiClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    let attempt = 0
    while (true) {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })

      // Проактивное торможение: если осталось мало токенов — пауза 200мс
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') ?? '99', 10)
      if (remaining <= 2 && response.ok) {
        await sleep(200)
      }

      if (response.status === 429) {
        attempt++
        if (attempt >= MAX_RETRIES) {
          throw new Error(`WB API 429: превышен лимит запросов после ${MAX_RETRIES} попыток`)
        }
        // Читаем X-Ratelimit-Retry — официальная рекомендация из документации
        const retryAfter = parseInt(response.headers.get('x-ratelimit-retry') ?? '10', 10)
        const waitMs = (retryAfter + 1) * 1000 * Math.pow(2, attempt - 1) // exponential backoff
        console.warn(`[wb-api] 429 → ждём ${waitMs / 1000}с (попытка ${attempt}/${MAX_RETRIES})`)
        await sleep(waitMs)
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`WB API Error ${response.status}: ${errorText}`)
      }

      return response.json() as Promise<T>
    }
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
   * История затрат по всем кампаниям за период (агрегировано, без детализации по дням)
   * Параметры: from / to (YYYY-MM-DD), макс. 31 день, лимит 1 req/sec
   */
  async getAdSpend(from: string, to: string): Promise<WBAdSpend[]> {
    const url = `${WB_ADV_URL}/adv/v1/upd?from=${from}&to=${to}`
    return this.fetch<WBAdSpend[]>(url)
  }

  /**
   * Статистика кампаний с детализацией по дням (v3)
   * GET /adv/v3/fullstats?ids=id1,id2&beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * Макс. 50 кампаний за запрос, макс. 31 день, лимит 3 req/min
   */
  async getAdStatsCampaigns(
    campaignIds: number[],
    beginDate: string,
    endDate: string,
  ): Promise<WBAdStatCampaign[]> {
    const ids = campaignIds.join(',')
    const url = `${WB_ADV_URL}/adv/v3/fullstats?ids=${ids}&beginDate=${beginDate}&endDate=${endDate}`
    return this.fetch<WBAdStatCampaign[]>(url)
  }

  /**
   * Получить список активных рекламных кампаний
   */
  async getAdCampaigns(): Promise<WBAdCampaign[]> {
    const url = `${WB_ADV_URL}/adv/v1/promotion/count`
    const data = await this.fetch<{ adverts?: Array<{ advertList: WBAdCampaign[]; status: number; type: number }> }>(url)
    return (data.adverts ?? []).flatMap(g => g.advertList ?? [])
  }

  /**
   * Получить детальную статистику по кампании за период (v2)
   * @param campaignId - ID кампании
   * @param dateFrom - YYYY-MM-DD
   * @param dateTo - YYYY-MM-DD
   */
  async getAdSpendFull(campaignId: number, dateFrom: string, dateTo: string): Promise<WBAdSpendFull | null> {
    const url = `${WB_ADV_URL}/adv/v2/fullstats`
    try {
      const data = await this.fetch<WBAdSpendFull[]>(url, {
        method: 'POST',
        body: JSON.stringify([{ id: campaignId, dates: [dateFrom, dateTo] }]),
      })
      return data?.[0] ?? null
    } catch {
      return null
    }
  }

  /**
   * Получить поставки на склады WB
   */
  async getIncomes(dateFrom: string): Promise<WBIncome[]> {
    const url = `${WB_STATS_URL}/api/v1/supplier/incomes?dateFrom=${dateFrom}`
    return this.fetch<WBIncome[]>(url)
  }

  /**
   * Воронка продаж за период (seller-analytics-api)
   * @param nmIds - артикулы WB (до 20 за запрос)
   * @param startDate - YYYY-MM-DD
   * @param endDate   - YYYY-MM-DD
   * Max период: 365 дней назад от текущей даты
   */
  async getFunnelHistory(nmIds: number[], startDate: string, endDate: string): Promise<WBFunnelItem[]> {
    const url = `${WB_ANALYTICS_URL}/api/analytics/v3/sales-funnel/products/history`
    const data = await this.fetch<WBFunnelItem[] | { data?: WBFunnelItem[] }>(url, {
      method: 'POST',
      body: JSON.stringify({
        selectedPeriod: { start: startDate, end: endDate },
        nmIds,
        skipDeletedNm: false,
        aggregationLevel: 'day',
      }),
    })
    return Array.isArray(data) ? data : (data?.data ?? [])
  }

  /**
   * Получить карточки товаров из Content API (постранично)
   */
  async getProducts(cursor?: { updatedAt?: string; nmID?: number }): Promise<{
    cards: WBProduct[]
    cursor: { updatedAt: string; nmID: number; total: number }
  }> {
    const url = `${WB_CONTENT_URL}/content/v2/get/cards/list`
    return this.fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        settings: {
          cursor: {
            limit: 100,
            ...(cursor?.updatedAt ? { updatedAt: cursor.updatedAt } : {}),
            ...(cursor?.nmID ? { nmID: cursor.nmID } : {}),
          },
          filter: { withPhoto: -1 },
        },
      }),
    })
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

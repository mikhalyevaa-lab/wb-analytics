/**
 * WB Analytics — Клиент Wildberries API
 * Документация: https://dev.wildberries.ru/docs
 */

const WB_STATS_URL     = 'https://statistics-api.wildberries.ru'
const WB_CONTENT_URL   = 'https://content-api.wildberries.ru'
const WB_ADV_URL       = 'https://advert-api.wildberries.ru'
const WB_ANALYTICS_URL = 'https://seller-analytics-api.wildberries.ru'
const WB_COMMON_URL    = 'https://common-api.wildberries.ru'
const WB_SUPPLIES_URL  = 'https://supplies-api.wildberries.ru'
const WB_RETURNS_URL   = 'https://returns-api.wildberries.ru'

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
  oblastOkrugName: string
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

// Заявки покупателей на возврат (returns-api.wildberries.ru)
// GET /api/v1/claims — только последние 14 дней, пагинация limit/offset
export interface WBClaim {
  id: string             // UUID заявки
  nm_id: number          // артикул WB
  status?: string        // статус заявки
  created_at?: string    // дата создания
  updated_at?: string    // дата последнего изменения
  actions?: string[]     // доступные действия (approve, reject, ...)
  // поля товара
  supplier_article?: string
  subject?: string
  category?: string
  brand?: string
  price?: number
  quantity?: number
  // поля возврата
  return_type?: string
  warehouse_name?: string
  [key: string]: unknown // дополнительные поля — схема уточняется
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

// Поставки FBW — новый API (supplies-api.wildberries.ru)
// statusID: 1=не запланировано 2=запланировано 3=отгрузка разрешена 4=идёт приёмка 5=принято 6=отгружено
export interface WBSupplyItem {
  phone: string
  supplyID: number | null
  preorderID: number
  createDate: string | null
  supplyDate: string | null
  factDate: string | null
  updatedDate: string | null
  statusID: number
  boxTypeID: number
  isBoxOnPallet?: boolean
}

export interface WBSupplyGood {
  barcode: string
  vendorCode: string
  nmID: number
  techSize: string
  quantity: number
  acceptedQuantity: number
  unloadingQuantity: number
  readyForSaleQuantity: number
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

export interface WBAdStatNm {
  nmId: number
  name?: string
  views: number
  clicks: number
  orders: number
  sum: number
  sum_price: number
  atbs?: number
  canceled?: number
}

export interface WBAdStatApp {
  appType: number
  nms: WBAdStatNm[]
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
  apps?: WBAdStatApp[]
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

// ---------- Тарифы и комиссии ----------

export interface WBCommission {
  subjectID: number
  subjectName: string
  parentID: number
  parentName: string
  kgvpMarketplace: number   // % комиссии для маркетплейс-схемы
  kgvpSupplier: number      // % комиссии для FBO (поставщик)
  kgvpSupplierExpress: number
  kgvpBooking: number       // % за бронирование
  kgvpPickup: number        // % самовывоз
  paidStorageKgvp: number   // % платного хранения
}

// Тарифы из API приходят строками с запятой в качестве разделителя ("0,07")
// Используем parseWBNum() для конвертации
export interface WBBoxTariff {
  warehouseName: string
  geoName: string
  boxDeliveryBase: string    // ₽ за первый литр (строка!)
  boxDeliveryLiter: string   // ₽ за каждый доп. литр (строка!)
  boxStorageBase: string     // ₽/литр/день хранение базовый (строка!)
  boxStorageLiter: string    // ₽/литр/день хранение доп. литр (строка!)
  boxDeliveryCoefExpr: string
  boxStorageCoefExpr: string
}

export interface WBBoxTariffsResponse {
  response: {
    data: {
      warehouseList: WBBoxTariff[]
      dtNextBox: string
      dtTillMax: string
    }
  }
}

export interface WBReturnTariff {
  warehouseName: string
  deliveryDumpSupOfficeBase: string   // Базовая стоимость возврата поставщику (₽)
  deliveryDumpSupOfficeLiter: string  // Доп. литр возврата поставщику (₽)
  deliveryDumpKgtOfficeBase: string   // Крупногабаритный возврат
  deliveryDumpKgtOfficeLiter: string
  deliveryDumpSupCourierBase: string
  deliveryDumpSupCourierLiter: string
  deliveryDumpSupReturnExpr: string
  deliveryDumpKgtReturnExpr: string
  deliveryDumpSrgOfficeExpr: string
  deliveryDumpSrgReturnExpr: string
}

export interface WBReturnTariffsResponse {
  response: {
    data: {
      warehouseList: WBReturnTariff[]
      dtNextDeliveryDumpKgt: string
      dtNextDeliveryDumpSrg: string
      dtNextDeliveryDumpSup: string
      dtTillMax: string
    }
  }
}

export interface WBPaidStorageRow {
  date: string
  logWarehouseCoef: number
  officeId: number
  warehouse: string
  warehouseCoef: number
  giId: number
  chrtId: number
  size: string
  barcode: string
  subject: string
  brand: string
  vendorCode: string
  nmId: number
  volume: number
  calcType: string
  warehousePrice: number
  barcodesCount: number
  palletPlaceCode: number
  palletCount: number
  originalDate: string
  loyaltyDiscount: number
  tariffFixDate: string
  tariffLowerDate: string
}

/** Парсит числа из WB API — "1 046" → 1046, "0,07" → 0.07, "-" → null */
export function parseWBNum(s: string | number | null | undefined): number | null {
  if (s == null || s === '-' || s === '') return null
  if (typeof s === 'number') return s
  const cleaned = s.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
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
  private analyticsKey: string

  constructor(apiKey: string, analyticsKey?: string) {
    this.apiKey = apiKey
    this.analyticsKey = analyticsKey ?? apiKey
  }

  private async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    // Аналитический API (seller-analytics-api) требует отдельный токен
    const isAnalyticsUrl = url.includes('seller-analytics-api.wildberries.ru')
    const token = isAnalyticsUrl ? this.analyticsKey : this.apiKey
    let attempt = 0
    while (true) {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': token,
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
    // API returns advert_list (snake_case) since ~2025; name field removed from this endpoint
    const data = await this.fetch<{
      adverts?: Array<{
        advert_list?: Partial<WBAdCampaign>[]
        advertList?:  Partial<WBAdCampaign>[]
        status: number
        type: number
      }>
    }>(url)
    return (data.adverts ?? []).flatMap(g => {
      const list = g.advert_list ?? g.advertList ?? []
      return list.map(item => ({
        advertId:    item.advertId ?? 0,
        name:        item.name ?? '',   // empty string when API doesn't return names
        type:        item.type ?? g.type,
        status:      item.status ?? g.status,
        dailyBudget: item.dailyBudget ?? 0,
        createTime:  item.createTime ?? '',
        changeTime:  item.changeTime ?? '',
        startTime:   item.startTime ?? '',
        endTime:     item.endTime ?? '',
      }))
    })
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
   * Заявки покупателей на возврат
   * GET /api/v1/claims (returns-api.wildberries.ru)
   * Токен категории «Возвраты покупателями».
   * Только последние 14 дней, пагинация limit(max 200)/offset.
   * is_archive=false — активные, true — архивные.
   */
  async getClaims(isArchive: boolean, limit = 200, offset = 0): Promise<WBClaim[]> {
    const url = `${WB_RETURNS_URL}/api/v1/claims?is_archive=${isArchive}&limit=${limit}&offset=${offset}`
    const result = await this.fetch<WBClaim[] | { data?: WBClaim[] } | null>(url)
    // API может вернуть массив напрямую или объект с полем data
    if (Array.isArray(result)) return result
    if (result && typeof result === 'object' && 'data' in result) return result.data ?? []
    return []
  }

  /**
   * Получить поставки на склады WB
   * @deprecated WB удалил этот endpoint. Используй getSupplies() / getSupplyGoods().
   */
  async getIncomes(dateFrom: string): Promise<WBIncome[]> {
    const url = `${WB_STATS_URL}/api/v1/supplier/incomes?dateFrom=${dateFrom}`
    return this.fetch<WBIncome[]>(url)
  }

  /**
   * Список поставок FBW — POST /api/v1/supplies
   * Токен должен иметь категорию «Поставки FBW».
   * @param statusIDs — фильтр по статусам (пусто = все, макс 1000 поставок)
   */
  async getSupplies(statusIDs?: number[]): Promise<WBSupplyItem[]> {
    const url = `${WB_SUPPLIES_URL}/api/v1/supplies?limit=1000`
    const body: Record<string, unknown> = {}
    if (statusIDs?.length) body.statusIDs = statusIDs
    const result = await this.fetch<WBSupplyItem[]>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return result ?? []
  }

  /**
   * Товары внутри конкретной поставки FBW — GET /api/v1/supplies/{id}/goods
   * Только для поставок с supplyID != null.
   */
  async getSupplyGoods(supplyID: number, offset = 0): Promise<WBSupplyGood[]> {
    const url = `${WB_SUPPLIES_URL}/api/v1/supplies/${supplyID}/goods?limit=1000&offset=${offset}`
    const result = await this.fetch<WBSupplyGood[]>(url)
    return result ?? []
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
   * Платное хранение: детализация по SKU и дням. Task-based через GET:
   *   1. GET /api/v1/paid_storage?dateFrom=...&dateTo=... → { taskId }
   *   2. GET /api/v1/paid_storage/tasks/{taskId}/download → данные (поллинг до готовности)
   * Макс. окно: 31 день. Требует wb_analytics_token.
   */
  async getPaidStorage(dateFrom: string, dateTo: string): Promise<WBPaidStorageRow[]> {
    // 1. Создаём задачу — ответ: { data: { taskId: "..." } }
    const taskRes = await this.fetch<{ data?: { taskId?: string }; taskId?: string }>(
      `${WB_ANALYTICS_URL}/api/v1/paid_storage?dateFrom=${dateFrom}&dateTo=${dateTo}`
    )
    const taskId = taskRes?.data?.taskId ?? taskRes?.taskId
    if (!taskId) {
      console.warn('[wb-api] paid_storage: taskId не получен', taskRes)
      return []
    }

    // 2. Поллинг до готовности (до 12 попыток × 10 сек = 2 мин)
    const downloadUrl = `${WB_ANALYTICS_URL}/api/v1/paid_storage/tasks/${taskId}/download`
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(10000)
      let result: unknown
      try {
        result = await this.fetch<unknown>(downloadUrl)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 400/404/202 = ещё не готово
        if (msg.includes('400') || msg.includes('404') || msg.includes('202') || msg.includes('425')) {
          console.log(`[wb-api] paid_storage ${taskId}: ждём (попытка ${attempt + 1}/12)`)
          continue
        }
        throw e
      }
      if (Array.isArray(result)) return result as WBPaidStorageRow[]
      const r = result as Record<string, unknown>
      if (Array.isArray(r?.data)) return r.data as WBPaidStorageRow[]
      // Если вернули taskId снова — всё ещё не готово
      if (r?.taskId) {
        console.log(`[wb-api] paid_storage ${taskId}: ещё готовится (попытка ${attempt + 1}/12)`)
        continue
      }
      // Неожиданный формат — возвращаем пустой массив
      console.warn('[wb-api] paid_storage: неожиданный формат ответа', result)
      return []
    }

    console.warn(`[wb-api] paid_storage ${taskId}: таймаут 2 мин`)
    return []
  }

  /**
   * Комиссии WB по предметам (subjectId → %)
   * GET /api/v1/tariffs/commission
   * Лимит: 1 req/min
   */
  async getCommissions(): Promise<WBCommission[]> {
    const url = `${WB_COMMON_URL}/api/v1/tariffs/commission`
    const data = await this.fetch<{ report: WBCommission[] }>(url)
    return data?.report ?? []
  }

  /**
   * Тарифы логистики FBW (коробки) по складам
   * GET /api/v1/tariffs/box?date=YYYY-MM-DD
   * Содержит: boxDeliveryBase, boxDeliveryLiter, boxStorageBase, boxStorageLiter
   * Лимит: 1 req/min
   */
  async getBoxTariffs(date?: string): Promise<WBBoxTariffsResponse> {
    const d = date ?? new Date().toISOString().split('T')[0]
    const url = `${WB_COMMON_URL}/api/v1/tariffs/box?date=${d}`
    return this.fetch<WBBoxTariffsResponse>(url)
  }

  /**
   * Тарифы возврата и повторной доставки по складам
   * GET /api/v1/tariffs/return?date=YYYY-MM-DD
   * Лимит: 1 req/min
   */
  async getReturnTariffs(date?: string): Promise<WBReturnTariffsResponse> {
    const d = date ?? new Date().toISOString().split('T')[0]
    const url = `${WB_COMMON_URL}/api/v1/tariffs/return?date=${d}`
    return this.fetch<WBReturnTariffsResponse>(url)
  }

  /**
   * Тарифы паллетной логистики
   * GET /api/v1/tariffs/pallet?date=YYYY-MM-DD
   * Лимит: 1 req/min
   */
  async getPalletTariffs(date?: string): Promise<{ response: { data: { warehouseList: WBBoxTariff[] } } }> {
    const d = date ?? new Date().toISOString().split('T')[0]
    const url = `${WB_COMMON_URL}/api/v1/tariffs/pallet?date=${d}`
    return this.fetch(url)
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
export function createWBClient(apiKey: string, analyticsKey?: string): WBApiClient {
  return new WBApiClient(apiKey, analyticsKey)
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

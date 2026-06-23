import { NextRequest, NextResponse } from 'next/server'

// Детектирует тип файла по заголовкам и возвращает маппинг колонок
export async function POST(req: NextRequest) {
  const { headers: rawHeaders } = await req.json() as { headers: string[] }
  const headers = rawHeaders.map(h => (h ?? '').toLowerCase().trim())

  // WB Finance report (реализационный отчёт WB)
  const isFinance = headers.some(h => h.includes('realizationreport_id') || h.includes('rrd_id') || h.includes('ppvz_for_pay') || h.includes('supplier_oper_name'))

  // WB Orders «Новая таблица» — спец. формат с barcode как float, techSize, Цена заказа
  const isOrdersFile =
    headers.some(h => h === 'barcode' || h === 'баркод') &&
    (headers.some(h => h === 'techsize' || h === 'технический размер') || headers.some(h => h === 'цена заказа'))

  // WB Orders (заказы WB)
  const isOrders = !isOrdersFile &&
    headers.some(h => h === 'gnumber' || h === 'g_number' || h === 'srid') &&
    headers.some(h => h.includes('totalprice') || h.includes('total_price'))

  // WB Ad spend (рекламная статистика) — custom export
  const isAdSpend = headers.some(h => h.includes('advertid') || h.includes('campaign_id') || h.includes('номер рк'))

  // WB Finance (русские заголовки — выгрузка из ЛК)
  const isFinanceRu = headers.some(h =>
    h === 'уникальный идентификатор строки' ||
    h.includes('тип документа') ||
    h === 'обоснование для перечисления' ||
    h === 'к перечислению продавцу'
  )

  if (isOrdersFile) {
    return NextResponse.json({
      type: 'wb_orders_file',
      label: '📦 Заказы WB — формат с баркодом и размерами',
      confidence: 'high',
      keyField: 'barcode + gNumber',
      uniqueKey: 'store_id + g_number + nm_id + barcode + date',
      columns: detectOrdersFileColumns(rawHeaders),
    })
  }

  if (isFinance || isFinanceRu) {
    return NextResponse.json({
      type: 'wb_finance',
      label: 'Финансовый отчёт WB (реализация)',
      confidence: 'high',
      keyField: 'rrd_id',
      uniqueKey: 'store_id + rrd_id',
      columns: detectFinanceColumns(rawHeaders),
    })
  }

  if (isOrders) {
    return NextResponse.json({
      type: 'wb_orders',
      label: 'Заказы WB',
      confidence: 'high',
      keyField: 'srid',
      uniqueKey: 'store_id + srid',
      columns: detectOrdersColumns(rawHeaders),
    })
  }

  if (isAdSpend) {
    return NextResponse.json({
      type: 'wb_ad_spend',
      label: 'Рекламная статистика',
      confidence: 'medium',
      keyField: 'campaign_id + date',
      uniqueKey: 'store_id + campaign_id + date',
      columns: detectAdColumns(rawHeaders),
    })
  }

  return NextResponse.json({
    type: 'unknown',
    label: 'Неизвестный формат',
    confidence: 'low',
    columns: rawHeaders.map((h, i) => ({ index: i, header: h, field: null })),
  })
}

function detectOrdersFileColumns(headers: string[]) {
  const map: Record<string, string[]> = {
    date:                 ['date', 'дата'],
    gNumber:              ['gnumber', 'g_number', 'номер заказа'],
    nmId:                 ['nmid', 'nm_id', 'артикул wb'],
    barcode:              ['barcode', 'баркод', 'шк'],
    techSize:             ['techsize', 'технический размер', 'размер'],
    supplierArticle:      ['supplierarticle', 'артикул поставщика'],
    category:             ['category', 'категория'],
    subject:              ['subject', 'предмет'],
    brand:                ['brand', 'бренд'],
    totalPrice:           ['totalprice', 'retail_price', 'цена'],
    discountPercent:      ['discountpercent', 'скидка покупателя', 'скидка%'],
    'Цена заказа':        ['цена заказа', 'pricewithdiscount', 'pricewithdisc', 'finishedprice'],
    srid:                 ['srid'],
    oblast:               ['oblastokorugname', 'regiontoname', 'область', 'регион получателя'],
    is_cancel:            ['iscancel', 'is_cancel', 'отмена'],
  }
  return mapColumns(headers, map)
}

function detectFinanceColumns(headers: string[]) {
  const map: Record<string, string[]> = {
    rrd_id:                 ['rrd_id', 'уникальный идентификатор строки'],
    realizationreport_id:   ['realizationreport_id', 'номер отчёта'],
    nm_id:                  ['nm_id', 'код номенклатуры', 'артикул wb'],
    brand_name:             ['brand_name', 'бренд'],
    sa_name:                ['sa_name', 'артикул поставщика'],
    subject_name:           ['subject_name', 'предмет'],
    doc_type_name:          ['doc_type_name', 'тип документа'],
    supplier_oper_name:     ['supplier_oper_name', 'обоснование для перечисления'],
    quantity:               ['quantity', 'количество'],
    retail_price:           ['retail_price', 'цена розничная'],
    retail_amount:          ['retail_amount', 'вайлдберриз реализовал товар (по договору)'],
    ppvz_for_pay:           ['ppvz_for_pay', 'к перечислению продавцу'],
    delivery_rub:           ['delivery_rub', 'услуги по доставке товара покупателю'],
    penalty:                ['penalty', 'общая сумма штрафов'],
    additional_payment:     ['additional_payment', 'доплаты'],
    date_from:              ['date_from', 'дата начала действия договора'],
    date_to:                ['date_to', 'дата конца действия договора'],
    sale_dt:                ['sale_dt', 'дата продажи'],
    order_dt:               ['order_dt', 'дата заказа'],
    commission_percent:     ['commission_percent', 'процент комиссии'],
    storage_fee:            ['storage_fee', 'стоимость хранения'],
    acceptance:             ['acceptance', 'стоимость платной приёмки'],
    deduction:              ['deduction', 'прочие удержания'],
  }
  return mapColumns(headers, map)
}

function detectOrdersColumns(headers: string[]) {
  const map: Record<string, string[]> = {
    date:             ['date', 'дата'],
    nm_id:            ['nmid', 'nm_id', 'артикул wb'],
    supplier_article: ['supplierarticle', 'supplier_article', 'артикул поставщика'],
    barcode:          ['barcode', 'баркод'],
    subject:          ['subject', 'предмет'],
    category:         ['category', 'категория'],
    brand:            ['brand', 'бренд'],
    total_price:      ['totalprice', 'total_price', 'цена'],
    discount_percent: ['discountpercent', 'discount_percent', 'скидка покупателя'],
    spp:              ['spp'],
    is_cancel:        ['iscancel', 'is_cancel', 'отмена'],
    g_number:         ['gnumber', 'g_number', 'номер заказа'],
    srid:             ['srid'],
    warehouse_name:   ['warehousename', 'warehouse_name', 'склад'],
    region_name:      ['regionname', 'region_name', 'регион'],
  }
  return mapColumns(headers, map)
}

function detectAdColumns(headers: string[]) {
  const map: Record<string, string[]> = {
    campaign_id:   ['advertid', 'campaign_id', 'номер рк', 'id рк'],
    campaign_name: ['campaign_name', 'название рк', 'наименование'],
    date:          ['date', 'дата'],
    spend:         ['spend', 'сумма', 'расход', 'бюджет'],
    views:         ['views', 'показы'],
    clicks:        ['clicks', 'клики'],
    orders_count:  ['orders', 'заказы шт', 'orders_count'],
    orders_sum:    ['orders_sum', 'заказы руб', 'сумма заказов'],
  }
  return mapColumns(headers, map)
}

function mapColumns(headers: string[], map: Record<string, string[]>) {
  return headers.map((h, i) => {
    const hl = h.toLowerCase().trim()
    const field = Object.entries(map).find(([, aliases]) => aliases.some(a => hl === a || hl.includes(a)))?.[0] ?? null
    return { index: i, header: h, field }
  })
}

# Вкладка «Обзор» — Техническое задание

## Executive Summary

Новая страница `/overview` — главный экран AI CFO для управляющей компании. Заменяет роль «стартовой точки» дня: одного взгляда достаточно, чтобы понять финансовый результат периода, выявить проблемы и принять решения. Данные берутся из Supabase (wb_finance, wb_orders, wb_sales, wb_ad_spend, products). Период выбирает пользователь.

---

## Маршрут и файловая структура

```
src/app/(app)/overview/
  page.tsx                        ← серверный компонент, загружает данные

src/components/overview/
  signal-cards.tsx                ← 4 карточки-сигнала
  kpi-cards.tsx                   ← 8 карточек KPI
  insights-row.tsx                ← строка автоматических инсайтов
  yesterday-cards.tsx             ← 3 оперативных карточки
  profit-waterfall.tsx            ← водопад прибыли
  orders-chart.tsx                ← график заказов и выручки 28 дней
  period-selector.tsx             ← переключатель периода (глобальный)

src/lib/queries-overview.ts       ← все запросы к Supabase для этой страницы
```

Навигацию добавить в `src/app/(app)/layout.tsx` — ссылка «Обзор» → `/overview`.

---

## Период (глобальный фильтр)

Переключатель в шапке страницы. Два режима:

| Режим | Поведение |
|-------|-----------|
| С начала года | dateFrom = 1 января текущего года, dateTo = сегодня |
| Произвольный | date range picker (shadcn `DatePickerWithRange`) |

Состояние периода — URL-параметры (`?from=2025-01-01&to=2025-06-20`), чтобы ссылку можно было сохранить. По умолчанию — «С начала года».

**Компонент:** `period-selector.tsx` — клиентский (`'use client'`), при изменении обновляет URL через `useRouter().push()`. Страница `page.tsx` читает период из `searchParams`.

---

## Блок 1 — Шапка страницы

```tsx
// Показываем:
// «Обзор» (h1)
// «ИП Михалёва · 1 янв — 20 июн 2025» (контекст периода + название магазина)
// «Обновлено 2 ч назад · авто» (время последней синхронизации)
```

**Данные:**
- Название магазина: `stores.name` по storeId пользователя
- Время синхронизации: `stores.last_sync_at` (или `max(wb_finance.create_dt)`)

---

## Блок 2 — Сигнальные карточки (4 шт.)

Горизонтальный ряд. Каждая карточка — быстрый срез по направлению.

### Карточка «Продажи» — РЕАЛЬНЫЕ ДАННЫЕ

```ts
// Заказы вчера (штук) из wb_orders
// Отклонение: сравниваем с тем же днём прошлой недели
SELECT count(*) FROM wb_orders
WHERE store_id IN (...) AND date::date = yesterday AND is_cancel = false

// Для отклонения: тот же запрос, но date = yesterday - 7 days
```

Отображение: `98 заказов · −24 к прошлой неделе`

### Карточка «Реклама» — ЗАГЛУШКА

```tsx
// MVP: статичные числа
// Заголовок: «Реклама»
// Значение: «19 задач»
// Бейдж: «7 критичных»
// Подпись: «(скоро)»
```

### Карточка «Поставки» — РЕАЛЬНЫЕ ДАННЫЕ

```ts
// Из wb_stocks (если есть) или из готовой функции getStocksData
// SKU с days_left < 14: «нужно заказать сейчас»
// SKU с days_left < 21: «на неделе»
// Использовать getStocksAlerts(storeIds) — новая функция в queries-overview.ts
```

### Карточка «Данные» — РЕАЛЬНЫЕ ДАННЫЕ

```ts
// Проверка качества данных
// Предупреждение: products WHERE store_id IN (...) AND cost_price = 0 → count
// Если count > 0: «Нет себестоимости у N товаров»
```

---

## Блок 3 — KPI-карточки (8 шт., 2 ряда по 4)

Все метрики за выбранный период. Красный цвет при отрицательном значении.

### Ряд 1

#### 1. Реализация (выручка от WB)
```ts
// wb_finance: сумма ppvz_for_pay где doc_type_name из directory с multiplier = 1
// Уже реализовано в getPnL() → revenue
```

#### 2. Чистая прибыль
```ts
// Реализация − Себестоимость − Комиссия WB − Логистика − Возвраты + ДопВыплаты
// Формула:
//   revenue (ppvz_for_pay, mult=1)
//   − cost (products.cost_price × wb_finance.quantity, mult=1)
//   − commission (ppvz_sales_commission, mult=1)
//   − logistics (delivery_rub)
//   − returns (|ppvz_for_pay|, mult=−1)
//   + additional_payment
```
Показывать маржу в %: `чистая прибыль / реализация × 100`.

#### 3. Маржа %
```ts
// Отдельная карточка: чистая прибыль / реализация × 100
// Красная если < 0
```

#### 4. Выручка вчера (предварительно)
```ts
// wb_orders: сумма total_price × (1 − discount_percent/100) за вчера
// Бейдж «предв.» — данные ещё не закрыты WB
// Подпись: «98 заказов»
```

### Ряд 2

#### 5. ROI
```ts
// чистая прибыль / себестоимость × 100
// Если себестоимость = 0 → показать «—»
```

#### 6. % выкупа
```ts
// wb_sales (продажи) / (wb_sales + wb_orders отменённые) × 100
// Точнее: sales / (sales + returns) из wb_finance
// Уже частично есть в getKpi() → buyoutRate
```

#### 7. Прибыль на единицу
```ts
// чистая прибыль / количество проданных единиц
// количество: sum(wb_finance.quantity) где mult=1
```

#### 8. Возвраты (сумма)
```ts
// wb_finance: |ppvz_for_pay| где multiplier = −1
// Уже в getPnL() → returns
// Подпись: «% от реализации»
```

---

## Блок 4 — Инсайты (автоматические выводы)

Горизонтальная строка из 5 плашек. Все рассчитываются автоматически.

```ts
// Нужна новая функция getInsights(storeIds, dateFrom, dateTo)
// Возвращает:
{
  worstProduct: { name: string; profit: number }  // минимальная прибыль по nm_id
  bestProduct:  { name: string; profit: number }  // максимальная прибыль по nm_id
  bestRoi:      { name: string; roi: number }     // лучший ROI по nm_id
  returnsAmount: number                           // сумма возвратов
  buyoutRate:   number                            // % выкупа по кабинету
}
```

**Логика расчёта прибыли по товару (nm_id):**
```ts
// JOIN wb_finance с products по nm_id
// profit = sum(ppvz_for_pay[mult=1]) 
//        − sum(cost_price × quantity[mult=1])
//        − sum(ppvz_sales_commission[mult=1])
//        − sum(delivery_rub)
//        − sum(|ppvz_for_pay[mult=−1]|)
// GROUP BY nm_id, products.name
```

Отображение: иконка + текст, горизонтальный скролл на мобиле.

---

## Блок 5 — Оперативные показатели «вчера» (3 карточки)

#### 1. Прибыль вчера — ЧАСТИЧНО РЕАЛЬНАЯ
```ts
// wb_orders вчера: выручка (оценочная)
// wb_ad_spend вчера: расход
// Оценочная прибыль = выручка − расход на рекламу (без учёта комиссии WB)
// Бейдж «предв.»
```

#### 2. Расход на рекламу вчера — РЕАЛЬНЫЕ ДАННЫЕ
```ts
// wb_ad_spend WHERE date = yesterday
// Уже есть в getAdPageData() → today.spend
```

#### 3. Критичных действий — ЗАГЛУШКА
```ts
// MVP: статичные числа («17 действий · 287 SKU»)
// Подпись: «(скоро)»
```

---

## Блок 6 — Водопад прибыли

Горизонтальные бары (bar chart Recharts). Показывает декомпозицию от реализации до чистой прибыли.

```ts
// Данные для водопада (из getOverviewFinance()):
[
  { label: 'Реализация',    value:  revenue,     type: 'positive' },
  { label: 'Себестоимость', value: -cost,         type: 'negative' },
  { label: 'Комиссия WB',   value: -commission,   type: 'negative' },
  { label: 'Логистика',     value: -logistics,    type: 'negative' },
  { label: 'Возвраты',      value: -returns,      type: 'negative' },
  { label: 'Чистая прибыль',value:  netProfit,    type: netProfit >= 0 ? 'positive' : 'negative' },
]
```

Индикатор сверки: `«Реализация → выплата WB сверена»` — показывать если в wb_finance есть записи за период.

**Компонент:** `profit-waterfall.tsx` — Recharts `BarChart` горизонтальный, цвета: зелёный / красный, подписи в рублях.

---

## Блок 7 — График «Заказы и продажи» (28 дней)

Двойной линейный график. Независимо от выбранного периода — всегда последние 28 дней.

```ts
// Уже частично реализовано в getDailySales()
// Дополнить: добавить поле revenue (выручка в руб.) в DailySales
// Два ряда: orders (шт.) и revenue (руб.)
// Две оси Y: левая — штуки, правая — рубли
```

Итоговые суммы под графиком: `Заказы: 2 836 шт. · Выручка: 3 437 922 ₽`

**Компонент:** переиспользовать/расширить `SalesChart` из dashboard или создать `orders-chart.tsx`.

---

## Новые функции в `queries-overview.ts`

```ts
// 1. Все финансовые данные за период (для KPI + водопад)
export async function getOverviewFinance(storeIds, dateFrom, dateTo): Promise<OverviewFinance>

// 2. Инсайты по товарам
export async function getInsights(storeIds, dateFrom, dateTo): Promise<Insights>

// 3. Заказы вчера + сравнение с прошлой неделей
export async function getYesterdayOrders(storeIds): Promise<YesterdayOrders>

// 4. Сигнал по поставкам (SKU с низким остатком)
export async function getStocksAlerts(storeIds): Promise<StocksAlerts>

// 5. Предупреждения качества данных
export async function getDataQualityAlerts(storeIds): Promise<DataQualityAlerts>
```

### `getOverviewFinance` — центральный запрос

```ts
// Один проход по wb_finance за период:
// SELECT nm_id, doc_type_name, quantity, ppvz_for_pay, 
//        ppvz_sales_commission, delivery_rub, penalty, additional_payment
// FROM wb_finance
// WHERE store_id IN (...) AND date_from >= ? AND date_to <= ?

// JOIN с directory для multiplier
// JOIN с products для cost_price

// Возвращает:
interface OverviewFinance {
  revenue: number           // ppvz_for_pay (mult=1)
  cost: number              // cost_price × quantity (mult=1)
  commission: number        // ppvz_sales_commission (mult=1)
  logistics: number         // delivery_rub
  returns: number           // |ppvz_for_pay| (mult=-1)
  penalties: number         // penalty
  additionalPayments: number
  netProfit: number         // = revenue - cost - commission - logistics - returns - penalties + additionalPayments
  margin: number            // netProfit / revenue * 100
  roi: number               // netProfit / cost * 100
  unitCount: number         // sum(quantity) mult=1
  profitPerUnit: number     // netProfit / unitCount
  buyoutRate: number        // sales / (sales + returns) * 100
}
```

---

## Структура `page.tsx`

```tsx
// src/app/(app)/overview/page.tsx
export const dynamic = 'force-dynamic'

export default async function OverviewPage({ searchParams }) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const storeIds = await getUserStoreIds(user.id)
  const stores   = await getStores(storeIds)

  // Период из URL-параметров
  const dateFrom = searchParams.from ?? `${new Date().getFullYear()}-01-01`
  const dateTo   = searchParams.to   ?? new Date().toISOString().split('T')[0]

  // Параллельная загрузка всех данных
  const [finance, insights, yesterday, stocks, dataQuality, adYesterday, dailySales] = 
    await Promise.all([
      getOverviewFinance(storeIds, dateFrom, dateTo),
      getInsights(storeIds, dateFrom, dateTo),
      getYesterdayOrders(storeIds),
      getStocksAlerts(storeIds),
      getDataQualityAlerts(storeIds),
      getAdYesterdaySpend(storeIds),   // из существующего getAdPageData или отдельно
      getDailySales(storeIds),         // уже есть
    ])

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <OverviewHeader stores={stores} dateFrom={dateFrom} dateTo={dateTo} />
      <PeriodSelector dateFrom={dateFrom} dateTo={dateTo} />
      <SignalCards yesterday={yesterday} stocks={stocks} dataQuality={dataQuality} />
      <KpiCards finance={finance} yesterday={yesterday} adYesterday={adYesterday} />
      <InsightsRow insights={insights} finance={finance} />
      <YesterdayCards finance={finance} adYesterday={adYesterday} yesterday={yesterday} />
      <ProfitWaterfall finance={finance} />
      <OrdersChart data={dailySales} />
    </div>
  )
}
```

---

## Дизайн-система (соответствие существующему коду)

- Карточки: `rounded-xl border bg-card p-4` (shadcn Card или div с классами)
- Отрицательные значения: `text-red-500`
- Положительные: `text-emerald-600`
- Бейдж «предв.»: `<Badge variant="secondary">предв.</Badge>`
- Бейдж «скоро»: `<Badge variant="outline" className="text-zinc-400">скоро</Badge>`
- Заголовки карточек: `text-sm text-zinc-500`
- Значения: `text-2xl font-semibold`

---

## Этапы реализации (рекомендуемый порядок)

1. **`getOverviewFinance`** — центральный запрос, всё зависит от него
2. **KPI-карточки** — покрывают 8 основных метрик
3. **Водопад прибыли** — визуализация той же функции
4. **Шапка + период** — навигация и URL-параметры
5. **Сигнальные карточки** — 2 реальных + 2 заглушки
6. **Инсайты** — отдельная функция по товарам
7. **График 28 дней** — расширение существующего
8. **Карточки «вчера»** — данные за прошлый день

---

## Что НЕ входит в MVP

- Реальная логика «задач по рекламе» и «критичных действий» — заглушки
- Фильтр по SKU (поиск) — добавить позже
- Кнопка «Экспорт» — добавить позже
- Уведомления (колокольчик) — добавить позже
- Мобильная адаптация (приоритет — десктоп)

---

## Открытые вопросы для реализации

1. **`wb_finance.date_from` vs `wb_orders.date`** — финансовый отчёт WB закрывается раз в 2 недели, поэтому период фильтрации по wb_finance может не совпадать с календарными датами. Решение: фильтровать по `date_from >= dateFrom AND date_to <= dateTo` для wb_finance, и по `date` для wb_orders/wb_ad_spend.
2. **Отсутствие себестоимости** — если `products.cost_price = 0` для товара, его себестоимость = 0 в расчётах. Показывать предупреждение в блоке «Данные».
3. **Пагинация wb_finance** — если записей > 1000, нужна пагинация (аналогично `fetchAllOrderRows`).

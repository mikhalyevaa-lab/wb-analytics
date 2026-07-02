export type MetricId = 'profit' | 'revenue' | 'orders' | 'buyout' | 'returns' | 'ads' | 'stock'

export interface MetricNode {
  id: MetricId
  label: string
  section: string
  href: string
  dependsOn: MetricId[]
  affects: MetricId[]
}

/**
 * Карта зависимостей метрик — данные, не хардкод в разметке (Ф3 редизайна Steep).
 * Цепочка: реклама → заказы → выручка (× выкуп/возвраты) → прибыль; заказы → запасы.
 */
export const METRIC_GRAPH: Record<MetricId, MetricNode> = {
  ads: {
    id: 'ads', label: 'ДРР', section: 'Реклама', href: '/advertising',
    dependsOn: [], affects: ['orders', 'profit'],
  },
  orders: {
    id: 'orders', label: 'Заказы', section: 'Продажи', href: '/rnp',
    dependsOn: ['ads'], affects: ['revenue', 'stock'],
  },
  revenue: {
    id: 'revenue', label: 'Выручка', section: 'Продажи', href: '/rnp',
    dependsOn: ['orders', 'buyout'], affects: ['profit'],
  },
  buyout: {
    id: 'buyout', label: '% выкупа', section: 'Продажи', href: '/funnel',
    dependsOn: ['returns'], affects: ['revenue'],
  },
  returns: {
    id: 'returns', label: 'Возвраты', section: 'Продажи', href: '/returns',
    dependsOn: [], affects: ['buyout', 'profit'],
  },
  stock: {
    id: 'stock', label: 'Запас хода', section: 'Товары', href: '/supplies',
    dependsOn: ['orders'], affects: ['revenue'],
  },
  profit: {
    id: 'profit', label: 'Чистая прибыль', section: 'Финансы', href: '/pnl',
    dependsOn: ['revenue', 'ads', 'returns'], affects: [],
  },
}

export const METRIC_GRAPH_ORDER: MetricId[] = ['ads', 'orders', 'revenue', 'buyout', 'returns', 'stock', 'profit']

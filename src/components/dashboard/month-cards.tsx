import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'
import type { MonthStats } from '@/lib/queries'

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
  return n.toLocaleString('ru')
}

function fmtRub(n: number) {
  return n.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽'
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
          {hint && <Hint width={280}>{hint}</Hint>}
        </div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
      </CardContent>
    </Card>
  )
}

function ForecastStat({ label, value, basis, hint }: { label: string; value: string; basis: string; hint?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-5">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
          {hint && <Hint width={280}>{hint}</Hint>}
        </div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
        <p className="text-xs text-zinc-400 mt-1">{basis}</p>
      </CardContent>
    </Card>
  )
}

export function MonthCards({ stats }: { stats: MonthStats }) {
  const costPerOrder = stats.orders > 0 ? stats.adSpend / stats.orders : 0
  const forecastCostPerOrder = stats.forecastOrders > 0
    ? stats.forecastAdSpend / stats.forecastOrders
    : 0
  const basis = `${stats.daysElapsed} из ${stats.daysInMonth} дней`

  return (
    <div className="space-y-3">
      {/* Текущий месяц */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Текущий месяц · {stats.periodLabel}
          </h2>
          <Hint width={300}>
            Накопленные показатели с 1-го числа по сегодня. Заказы — из воронки продаж WB, реклама — из API рекламы.
          </Hint>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Stat label="Заказы, шт" value={stats.orders.toLocaleString('ru')}
            hint="Количество заказов с начала месяца по данным воронки продаж WB." />
          <Stat label="Сумма заказов" value={fmtRub(stats.revenue)}
            hint="Сумма цен заказанных товаров с начала месяца. Не равна выручке — часть заказов может быть отменена или не выкуплена." />
          <Stat label="Реклама, руб" value={fmtRub(stats.adSpend)}
            hint="Суммарные расходы на рекламу с начала месяца по данным API рекламы WB." />
          <Stat label="Цена заказа, руб" value={costPerOrder > 0 ? fmtRub(costPerOrder) : '—'}
            hint="Расходы на рекламу ÷ количество заказов. Показывает, сколько в среднем стоит привлечение одного заказа через рекламу." />
          <Stat label="Переходов" value={fmtNum(stats.clicks)}
            hint="Количество кликов по рекламным объявлениям с начала месяца." />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <Stat label="Выкупы, шт" value={stats.sales.toLocaleString('ru')}
            hint={<>Количество реализованных позиций с начала месяца. Источник: <code className="text-xs bg-muted px-1 rounded">wb_sales</code>, только строки с <code className="text-xs bg-muted px-1 rounded">is_realization = true</code>. Не включает отмены и возвраты.</>} />
          <Stat label="% выкупа" value={stats.buyoutRate > 0 ? `${stats.buyoutRate}%` : '—'}
            hint="Доля заказов, которые дошли до выкупа. = Выкупы ÷ Заказы × 100. Норма для WB: 50–80%. Низкий % может говорить о проблемах с описанием, размерной сеткой или качеством товара." />
          <Stat label="Средний чек" value={stats.sales > 0 ? fmtRub(stats.revenue / stats.sales) : '—'}
            hint={<>Средняя сумма одного заказа. = Сумма заказов ÷ Выкупы. Источник суммы — воронка WB (<code className="text-xs bg-muted px-1 rounded">wb_funnel</code>).</>} />
        </div>
      </div>

      {/* Прогноз */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Прогноз на месяц · на {stats.daysInMonth} дней
          </h2>
          <Hint width={320}>
            <strong>Формула прогноза</strong><br /><br />
            Текущее значение × (дней в месяце ÷ прошедших дней)<br /><br />
            Например: прошло {stats.daysElapsed} дней из {stats.daysInMonth} — все показатели масштабируются на коэффициент {stats.daysInMonth}/{stats.daysElapsed}. Прогноз линейный, не учитывает сезонность и выходные.
          </Hint>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <ForecastStat label="Заказы, шт" value={stats.forecastOrders.toLocaleString('ru')} basis={basis}
            hint={`Прогноз = ${stats.orders.toLocaleString('ru')} заказов × (${stats.daysInMonth} ÷ ${stats.daysElapsed})`} />
          <ForecastStat label="Сумма заказов" value={fmtRub(stats.forecastRevenue)} basis={basis}
            hint="Прогнозируемая сумма заказов до конца месяца при текущем темпе." />
          <ForecastStat label="Реклама, руб" value={fmtRub(stats.forecastAdSpend)} basis={basis}
            hint="Прогнозируемые расходы на рекламу до конца месяца при текущем темпе." />
          <ForecastStat label="Цена заказа, руб" value={forecastCostPerOrder > 0 ? fmtRub(forecastCostPerOrder) : '—'} basis={basis}
            hint="Прогнозируемая стоимость одного заказа. Считается из прогнозных значений рекламы и заказов." />
          <ForecastStat label="Переходов" value={fmtNum(stats.forecastClicks)} basis={basis}
            hint="Прогнозируемое количество переходов по рекламе до конца месяца." />
        </div>
      </div>
    </div>
  )
}

interface Props {
  weekDelivery: number
  monthDelivery: number
  perUnitDelivery: number | null
  localOrders: { pct: number; prevPct: number; topRegions: { name: string; count: number; pct: number }[] }
}

function fmt(n: number) {
  return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽'
}

function DeltaBadge({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return null
  const d = ((cur - prev) / Math.abs(prev)) * 100
  const up = d >= 0
  return (
    <span className={`text-xs ${up ? 'text-red-500' : 'text-emerald-500'}`}>
      {up ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
    </span>
  )
}

export function LogisticsCosts({ weekDelivery, monthDelivery, perUnitDelivery, localOrders }: Props) {
  const locDelta = localOrders.prevPct
    ? ((localOrders.pct - localOrders.prevPct) / Math.abs(localOrders.prevPct)) * 100
    : null

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Затраты на логистику</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Неделя */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">С начала недели</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{fmt(weekDelivery)}</p>
          <p className="text-xs text-zinc-400 mt-1">факт из финансов WB</p>
        </div>

        {/* Месяц */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">С начала месяца</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">{fmt(monthDelivery)}</p>
          <p className="text-xs text-zinc-400 mt-1">факт из финансов WB</p>
        </div>

        {/* На штуку */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">На штуку (30д)</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {perUnitDelivery != null ? fmt(perUnitDelivery) : '—'}
          </p>
          <p className="text-xs text-zinc-400 mt-1">доставка / кол-во продаж</p>
        </div>

        {/* Прогноз */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 opacity-60">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Прогноз на месяц</p>
          <p className="text-2xl font-bold text-zinc-400 mt-2">—</p>
          <p className="text-xs text-zinc-400 mt-1">в разработке</p>
        </div>
      </div>

      {/* Локальные заказы */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Локальные заказы</p>
            <p className="text-xs text-zinc-400 mt-0.5">заказы из того же федерального округа, что и склад</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {localOrders.pct.toFixed(1)}%
            </p>
            {locDelta !== null && (
              <span className={`text-sm ${locDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {locDelta >= 0 ? '↑' : '↓'} {Math.abs(locDelta).toFixed(1)}% vs прошлая неделя
              </span>
            )}
          </div>
        </div>

        {localOrders.topRegions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Топ регионов</p>
            {localOrders.topRegions.map(r => (
              <div key={r.name} className="flex items-center gap-2">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 w-48 truncate">{r.name}</p>
                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full"
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 w-10 text-right">{r.pct.toFixed(0)}%</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import type { StocksAlert } from '@/lib/queries-overview'

/** Диаграмма 4 — Запас хода: дни до нуля по SKU (ranked bars) */
export function RunwayBars({ items }: { items: StocksAlert[] }) {
  const top = items.slice(0, 4)
  if (!top.length) {
    return <div className="text-[13px] py-8 text-center" style={{ color: 'var(--app-graphite)' }}>Нет товаров с риском закончиться</div>
  }
  const maxDays = Math.max(...top.map(i => i.days_of_stock), 1)

  return (
    <div className="flex flex-col gap-3">
      {top.map(item => {
        const pct = Math.min(100, (item.days_of_stock / maxDays) * 100)
        const risky = item.days_of_stock < 14
        const color = risky ? 'var(--app-rust)' : '#b06a4a'
        return (
          <div key={item.nm_id} className="grid items-center gap-3" style={{ gridTemplateColumns: '96px 1fr 32px' }}>
            <span className="text-[13px] truncate" style={{ color: 'var(--app-ash)' }} title={item.title}>{item.title || item.nm_id}</span>
            <span className="h-2.5 rounded-full relative" style={{ background: 'var(--app-fog)' }}>
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className="text-[13px] font-medium text-right" style={{ color }}>{item.days_of_stock}</span>
          </div>
        )
      })}
      <div className="text-[12px]" style={{ color: 'var(--app-graphite)' }}>Красная зона — менее 14 дней, пора в поставку</div>
    </div>
  )
}

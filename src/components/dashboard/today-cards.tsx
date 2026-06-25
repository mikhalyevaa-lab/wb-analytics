'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Hint } from '@/components/ui/hint'

interface Stats {
  orders: number
  order_sum: number
  ad_spend: number
  clicks: number
  cost_per_order: number
  dateFrom: string
  dateTo: string
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс'
  return n.toLocaleString('ru')
}
function fmtRub(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн ₽'
  if (n >= 1_000) return Math.round(n / 1_000) + ' тыс ₽'
  return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽'
}
function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: 'Сегодня', days: 0 },
  { label: '7 дн',   days: 7 },
  { label: '14 дн',  days: 14 },
  { label: '30 дн',  days: 30 },
  { label: '90 дн',  days: 90 },
]

function Stat({
  label, value, hint, loading,
}: { label: string; value: string; hint?: React.ReactNode; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
          {hint && <Hint width={280}>{hint}</Hint>}
        </div>
        {loading
          ? <div className="h-8 mt-1.5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-3/4" />
          : <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">{value}</p>
        }
      </CardContent>
    </Card>
  )
}

function periodLabel(preset: { label: string; days: number }, dateTo: string) {
  if (preset.days === 0) {
    const d = new Date(dateTo + 'T00:00:00')
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return `последние ${preset.days} дней`
}

export function TodayCards() {
  const [activePreset, setActivePreset] = useState(PRESETS[0])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((preset: { label: string; days: number }) => {
    setLoading(true)
    const today = moscowDate(0)
    const from  = preset.days === 0 ? today : moscowDate(preset.days)
    fetch(`/api/dashboard/stats?from=${from}&to=${today}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(PRESETS[0]) }, [load])

  function selectPreset(p: { label: string; days: number }) {
    setActivePreset(p)
    load(p)
  }

  const label = stats ? periodLabel(activePreset, stats.dateTo) : '…'

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            {activePreset.days === 0 ? 'Сегодня' : 'Период'} · {label}
          </h2>
          <Hint width={300}>
            <strong>Источник данных</strong><br /><br />
            Заказы и сумма заказов — воронка продаж WB (обновляется при синхронизации).<br /><br />
            Реклама и переходы — API рекламы WB. Данные за текущий день могут появляться с задержкой 2–4 часа.
          </Hint>
        </div>
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => selectPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                activePreset.label === p.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-zinc-500 dark:text-zinc-400 hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat loading={loading} label="Заказы, шт" value={stats ? stats.orders.toLocaleString('ru') : '—'}
          hint={<p>Количество заказов за выбранный период. Источник — воронка продаж WB.</p>} />
        <Stat loading={loading} label="Сумма заказов" value={stats ? fmtRub(stats.order_sum) : '—'}
          hint={<p>Сумма цен заказанных товаров. Источник — воронка продаж WB.</p>} />
        <Stat loading={loading} label="Реклама, руб" value={stats ? fmtRub(stats.ad_spend) : '—'}
          hint={<p>Расходы на рекламу за период.</p>} />
        <Stat loading={loading} label="Цена заказа" value={stats && stats.cost_per_order > 0 ? fmtRub(stats.cost_per_order) : '—'}
          hint={<p>Рекламный бюджет ÷ количество заказов.</p>} />
        <Stat loading={loading} label="Переходов" value={stats ? fmt(stats.clicks) : '—'}
          hint={<p>Клики по рекламным объявлениям за период.</p>} />
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'

interface StoreSettings {
  supply_days?: number | null
  safety_stock_days?: number | null
  ad_budget_limit?: number | null
  target_drr_pct?: number | null
  control_window_days?: number | null
  plan_orders_per_day?: number | null
  plan_revenue_per_day?: number | null
  min_margin_pct?: number | null
}

function Field({ label, hint, name, value, onChange, suffix }: {
  label: string
  hint?: string
  name: string
  value: string
  onChange: (k: string, v: string) => void
  suffix?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={value}
          onChange={e => onChange(name, e.target.value)}
          className="w-28 px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
          placeholder="—"
        />
        {suffix && <span className="text-xs text-zinc-400 w-6">{suffix}</span>}
      </div>
    </div>
  )
}

export function StoreSettingsForm() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/store')
      .then(r => r.json())
      .then((d: StoreSettings) => {
        setValues({
          supply_days: d.supply_days != null ? String(d.supply_days) : '',
          safety_stock_days: d.safety_stock_days != null ? String(d.safety_stock_days) : '',
          ad_budget_limit: d.ad_budget_limit != null ? String(d.ad_budget_limit) : '',
          target_drr_pct: d.target_drr_pct != null ? String(d.target_drr_pct) : '',
          control_window_days: d.control_window_days != null ? String(d.control_window_days) : '',
          plan_orders_per_day: d.plan_orders_per_day != null ? String(d.plan_orders_per_day) : '',
          plan_revenue_per_day: d.plan_revenue_per_day != null ? String(d.plan_revenue_per_day) : '',
          min_margin_pct: d.min_margin_pct != null ? String(d.min_margin_pct) : '',
        })
      })
      .catch(() => {})
  }, [])

  function set(k: string, v: string) {
    setValues(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(values)) {
        body[k] = v === '' ? null : Number(v)
      }
      const res = await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally { setSaving(false) }
  }

  const fields = [
    { name: 'supply_days', label: 'Срок поставки', hint: 'Сколько дней от заказа до прихода на склад', suffix: 'дн' },
    { name: 'safety_stock_days', label: 'Страховой запас', hint: 'Минимальный буфер перед следующей поставкой', suffix: 'дн' },
    { name: 'plan_orders_per_day', label: 'План заказов / день', hint: 'Цель для дашборда', suffix: 'шт' },
    { name: 'plan_revenue_per_day', label: 'План выручки / день', hint: 'Цель для дашборда', suffix: '₽' },
    { name: 'min_margin_pct', label: 'Минимальная маржа', hint: 'Ниже этого — красная подсветка в P&L', suffix: '%' },
    { name: 'ad_budget_limit', label: 'Лимит рекламы', hint: 'Бюджет на рекламу в месяц', suffix: '₽' },
    { name: 'target_drr_pct', label: 'Целевой ДРР', hint: 'Доля рекламных расходов от выручки', suffix: '%' },
    { name: 'control_window_days', label: 'Окно контроля', hint: 'Период для расчёта метрик рекламы', suffix: 'дн' },
  ]

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Параметры магазина</h2>
      <div className="space-y-4 divide-y divide-zinc-100 dark:divide-zinc-800">
        {fields.map((f, i) => (
          <div key={f.name} className={i > 0 ? 'pt-4' : ''}>
            <Field
              label={f.label}
              hint={f.hint}
              name={f.name}
              value={values[f.name] ?? ''}
              onChange={set}
              suffix={f.suffix}
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">✓ Сохранено</span>}
      </div>
    </div>
  )
}

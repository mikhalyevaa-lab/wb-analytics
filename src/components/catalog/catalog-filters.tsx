'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type Filters, type ProductGroup, type CatalogProduct } from './catalog-table'

interface Props {
  filters: Filters
  groups: ProductGroup[]
  products: CatalogProduct[]
  onChange: (f: Filters) => void
  onReset: () => void
}

function RangeFilter({ label, minKey, maxKey, filters, onChange }: {
  label: string
  minKey: keyof Filters
  maxKey: keyof Filters
  filters: Filters
  onChange: (f: Filters) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      <div className="flex gap-1">
        <Input
          placeholder="от"
          value={filters[minKey] as string}
          onChange={e => onChange({ ...filters, [minKey]: e.target.value })}
          className="h-7 text-xs"
        />
        <Input
          placeholder="до"
          value={filters[maxKey] as string}
          onChange={e => onChange({ ...filters, [maxKey]: e.target.value })}
          className="h-7 text-xs"
        />
      </div>
    </div>
  )
}

function CheckboxList({ label, items, selected, onChange }: {
  label: string
  items: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-medium mb-1">{label}</p>
      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
        {items.map(item => {
          const checked = selected.includes(item)
          return (
            <label key={item} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter(v => v !== item) : [...selected, item])}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="text-xs truncate">{item}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function CatalogFiltersPanel({ filters, groups, products, onChange, onReset }: Props) {
  const subjectNames = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.subject_name) set.add(p.subject_name)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [products])

  return (
    <div className="w-56 flex-none border rounded-lg p-3 overflow-y-auto space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Фильтры</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onReset}>Сбросить</Button>
      </div>

      <div>
        <p className="text-xs font-medium mb-1">Группа</p>
        <div className="space-y-1">
          {[{ id: '__none__', name: 'Без группы', color: '#94a3b8' }, ...groups].map(g => {
            const checked = filters.group_ids.includes(g.id)
            return (
              <label key={g.id} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? filters.group_ids.filter(id => id !== g.id)
                      : [...filters.group_ids, g.id]
                    onChange({ ...filters, group_ids: next })
                  }}
                  className="h-3.5 w-3.5 rounded"
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-none"
                  style={{ backgroundColor: g.id === '__none__' ? '#94a3b8' : g.color }}
                />
                <span className="text-xs truncate">{g.name}</span>
              </label>
            )
          })}
        </div>
      </div>

      <CheckboxList
        label="Предмет"
        items={subjectNames}
        selected={filters.subject_names}
        onChange={next => onChange({ ...filters, subject_names: next })}
      />

      <RangeFilter label="% выкупа" minKey="buyout_rate_min" maxKey="buyout_rate_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Себестоимость" minKey="cost_price_min" maxKey="cost_price_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Цена до СПП" minKey="avg_price_before_spp_min" maxKey="avg_price_before_spp_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Цена после СПП" minKey="avg_price_after_spp_min" maxKey="avg_price_after_spp_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Заказов/день" minKey="avg_orders_per_day_min" maxKey="avg_orders_per_day_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Остаток" minKey="current_stock_min" maxKey="current_stock_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Себест. остатков, ₽" minKey="stock_cost_value_min" maxKey="stock_cost_value_max" filters={filters} onChange={onChange} />
      <RangeFilter label="Стоим. остатков (до СПП), ₽" minKey="stock_retail_value_min" maxKey="stock_retail_value_max" filters={filters} onChange={onChange} />

      <Button variant="outline" size="sm" className="w-full mt-1" onClick={onReset}>
        Сбросить все фильтры
      </Button>
    </div>
  )
}

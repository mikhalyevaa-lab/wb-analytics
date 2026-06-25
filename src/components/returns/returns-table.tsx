'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface ReturnItem {
  nm_id: number
  article: string
  title: string | null
  photo_url: string | null
  sales_28d: number
  returns_28d: number
  buyout_rate: number
  net_revenue: number
  returns_sum: number
}

type SortKey = 'buyout_rate' | 'returns_28d' | 'returns_sum' | 'net_revenue'

function fmtRub(n: number) {
  return n.toLocaleString('ru', { maximumFractionDigits: 0 }) + ' ₽'
}

function BuyoutBadge({ rate }: { rate: number }) {
  const bg = rate < 30 ? 'bg-red-100 text-red-700'
    : rate < 40 ? 'bg-orange-100 text-orange-700'
    : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${bg}`}>
      {rate.toFixed(1)}%
    </span>
  )
}

function SortIcon({ field, sort }: { field: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' } }) {
  if (sort.key !== field) return <ChevronsUpDown className="h-3 w-3 text-zinc-400" />
  return sort.dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-zinc-600" />
    : <ChevronDown className="h-3 w-3 text-zinc-600" />
}

export function ReturnsTable({
  items,
  loading,
  total,
}: {
  items: ReturnItem[]
  loading: boolean
  total: number
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'buyout_rate', dir: 'asc' })

  const toggleSort = (key: SortKey) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'buyout_rate' ? 'asc' : 'desc' })
  }

  const sorted = [...items].sort((a, b) => {
    const v = sort.dir === 'asc' ? 1 : -1
    return (a[sort.key] - b[sort.key]) * v
  })

  const ThSort = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-zinc-800 transition-colors"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon field={field} sort={sort} />
      </span>
    </th>
  )

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="text-center py-12 text-zinc-400">
        <p className="text-lg font-medium">Нет SKU с выкупом ниже порога</p>
        <p className="text-sm mt-1">Попробуйте увеличить порог или снизить минимальное число продаж</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-zinc-400 mb-3">
        Показано {items.length} из {total} SKU · сортировка: {sort.key === 'buyout_rate' ? '% выкупа' : sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Артикул</th>
              <ThSort label="Выкуп %" field="buyout_rate" />
              <ThSort label="Продаж 28д" field="net_revenue" />
              <ThSort label="Возвратов" field="returns_28d" />
              <ThSort label="Сумма возвр." field="returns_sum" />
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Выручка (нетто)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sorted.map(item => (
              <tr key={item.nm_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    {item.photo_url && (
                      <img src={item.photo_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-zinc-100" />
                    )}
                    <div>
                      <Link
                        href={`/sku/${item.nm_id}`}
                        className="font-medium text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300"
                      >
                        {item.article}
                      </Link>
                      <p className="text-xs text-zinc-400">{item.nm_id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <BuyoutBadge rate={item.buyout_rate} />
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {item.sales_28d}
                </td>
                <td className="px-3 py-3">
                  <span className={item.returns_28d > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-zinc-500'}>
                    {item.returns_28d}
                  </span>
                </td>
                <td className="px-3 py-3 text-red-600 dark:text-red-400 font-medium">
                  {item.returns_sum > 0 ? '−' + fmtRub(item.returns_sum) : '—'}
                </td>
                <td className="px-3 py-3">
                  <span className={item.net_revenue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {item.net_revenue >= 0 ? '+' : ''}{fmtRub(item.net_revenue)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DataQualityItem } from '@/app/api/data-quality/route'

// Источники, критичные для дашборда
const CRITICAL = ['orders', 'sales', 'funnel']

export function DataQualityAlert() {
  const [bad, setBad] = useState<DataQualityItem[]>([])

  useEffect(() => {
    fetch('/api/data-quality')
      .then(r => r.json())
      .then((d: { items?: DataQualityItem[] }) => {
        const items = d.items ?? []
        setBad(items.filter(i => CRITICAL.includes(i.method) && (i.status === 'error' || i.status === 'stale')))
      })
      .catch(() => {})
  }, [])

  if (!bad.length) return null

  const hasError = bad.some(i => i.status === 'error')

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm ${
      hasError
        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
        : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
    }`}>
      <span className={hasError ? 'text-red-500' : 'text-amber-500'}>⚠</span>
      <span className={`flex-1 ${hasError ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
        Данные могут быть неактуальны:{' '}
        <span className="font-medium">{bad.map(i => i.label).join(', ')}</span>
      </span>
      <Link
        href="/settings"
        className={`text-xs hover:underline whitespace-nowrap ${hasError ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
      >
        Обновить →
      </Link>
    </div>
  )
}

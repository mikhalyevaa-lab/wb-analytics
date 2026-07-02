'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export const PERIOD_PRESETS = [
  { label: 'Сегодня', days: 0 },
  { label: '7 дн', days: 7 },
  { label: '14 дн', days: 14 },
  { label: '30 дн', days: 30 },
  { label: '90 дн', days: 90 },
] as const

function moscowDate(offsetDays = 0) {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().split('T')[0]
}

/**
 * Единый период (from/to/preset) в URL search params — переживает переходы
 * между разделами (Ф1 редизайна Steep).
 */
export function usePeriod() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const dateFrom = searchParams.get('from') ?? moscowDate(30)
  const dateTo = searchParams.get('to') ?? moscowDate(0)
  const preset = searchParams.get('preset') ?? '30 дн'

  const setRange = useCallback((from: string, to: string, presetLabel?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', from)
    params.set('to', to)
    if (presetLabel) params.set('preset', presetLabel)
    else params.delete('preset')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  const setPreset = useCallback((label: string, days: number) => {
    const from = days === 0 ? moscowDate(0) : moscowDate(days)
    const to = moscowDate(0)
    setRange(from, to, label)
  }, [setRange])

  const periodLabel = useMemo(() => {
    if (preset) return preset === 'Сегодня' ? 'сегодня' : `последние ${preset}`
    return `${dateFrom} — ${dateTo}`
  }, [preset, dateFrom, dateTo])

  return { dateFrom, dateTo, preset, setRange, setPreset, periodLabel }
}

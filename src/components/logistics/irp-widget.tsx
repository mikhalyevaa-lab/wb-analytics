'use client'

import { useState } from 'react'
import { IrpInputModal } from './irp-input-modal'

interface IndexRow {
  week_date: string
  irp: number | null
  localization_index: number | null
}

interface Props {
  rows: IndexRow[]
  hasPendingInput: boolean
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1
  const w = 80, h = 28
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function delta(current: number | null, prev: number | null): { pct: string; up: boolean } | null {
  if (current == null || prev == null || prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  return { pct: (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', up: pct >= 0 }
}

export function IrpWidget({ rows, hasPendingInput }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [pending, setPending] = useState(hasPendingInput)

  const sorted = [...rows].sort((a, b) => a.week_date.localeCompare(b.week_date))
  const latest = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]

  const irpDelta = delta(latest?.irp ?? null, prev?.irp ?? null)
  const locDelta = delta(latest?.localization_index ?? null, prev?.localization_index ?? null)

  const irpHistory = sorted.slice(-4).map(r => r.irp)
  const locHistory = sorted.slice(-4).map(r => r.localization_index)

  const weekLabel = latest?.week_date
    ? new Date(latest.week_date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <>
      {pending && (
        <div className="col-span-2 flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm">
          <span className="text-amber-500 text-base">⚠</span>
          <span className="text-amber-800 dark:text-amber-300 flex-1">
            Не введены данные ИРП и индекса локализации за текущую неделю
          </span>
          <button
            onClick={() => setModalOpen(true)}
            className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-medium transition-colors"
          >
            Ввести данные
          </button>
        </div>
      )}

      {/* ИРП */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">ИРП</p>
            <p className="text-xs text-zinc-400">индекс распределения продаж</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            + Обновить
          </button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {latest?.irp != null ? latest.irp.toFixed(2) + '%' : '—'}
            </p>
            {irpDelta && (
              <p className={`text-sm mt-0.5 ${irpDelta.up ? 'text-emerald-500' : 'text-red-500'}`}>
                {irpDelta.up ? '↑' : '↓'} {irpDelta.pct} к прошлой неделе
              </p>
            )}
            <p className="text-xs text-zinc-400 mt-0.5">неделя с {weekLabel}</p>
          </div>
          <Sparkline values={irpHistory} />
        </div>
      </div>

      {/* Индекс локализации */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Индекс локализации</p>
            <p className="text-xs text-zinc-400">% местных заказов по WB</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            + Обновить
          </button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {latest?.localization_index != null
                ? latest.localization_index.toFixed(2)
                : '—'}
            </p>
            {locDelta && (
              <p className={`text-sm mt-0.5 ${locDelta.up ? 'text-emerald-500' : 'text-red-500'}`}>
                {locDelta.up ? '↑' : '↓'} {locDelta.pct} к прошлой неделе
              </p>
            )}
            <p className="text-xs text-zinc-400 mt-0.5">неделя с {weekLabel}</p>
          </div>
          <Sparkline values={locHistory} />
        </div>
      </div>

      <IrpInputModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); setPending(false) }}
      />
    </>
  )
}

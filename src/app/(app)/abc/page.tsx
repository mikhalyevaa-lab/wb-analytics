'use client'

import { useState, useCallback } from 'react'
import { AbcTable, type AbcRow } from '@/components/abc/abc-table'
import { AbcPanel } from '@/components/abc/abc-panel'

function today() { return new Date().toISOString().split('T')[0] }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

type Summary = {
  A: { count: number; revenue: number }
  B: { count: number; revenue: number }
  C: { count: number; revenue: number }
}

const PRESETS = [
  { label: '7д', days: 7 },
  { label: '14д', days: 14 },
  { label: '30д', days: 30 },
  { label: '90д', days: 90 },
]

function fmtM(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000) return Math.round(n / 1_000) + ' тыс'
  return String(Math.round(n))
}

export default function AbcPage() {
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo]     = useState(today())
  const [rows, setRows]         = useState<AbcRow[]>([])
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [missingCost, setMissingCost] = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [activePreset, setActivePreset] = useState('30д')
  const [selectedRow, setSelectedRow]   = useState<AbcRow | null>(null)

  const [thA, setThA]   = useState(80)
  const [thB, setThB]   = useState(95)
  const [thMA, setThMA] = useState(30)
  const [thMB, setThMB] = useState(10)
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(async (
    from: string, to: string,
    tA = thA, tB = thB, tMA = thMA, tMB = thMB
  ) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({
        from, to,
        thresholdA:  String(tA / 100),
        thresholdB:  String(tB / 100),
        thresholdMA: String(tMA / 100),
        thresholdMB: String(tMB / 100),
      })
      const res = await fetch(`/api/abc?${params}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRows(data.rows ?? [])
      setSummary(data.summary ?? null)
      setMissingCost(data.missingCost ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [thA, thB, thMA, thMB])

  function applyPreset(label: string, days: number) {
    const from = daysAgo(days), to = today()
    setDateFrom(from); setDateTo(to); setActivePreset(label)
    load(from, to)
  }

  function applyCustom() { setActivePreset(''); load(dateFrom, dateTo) }

  function applyThresholds() {
    setShowSettings(false)
    load(dateFrom, dateTo, thA, thB, thMA, thMB)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className={`flex-1 min-w-0 p-6 space-y-5 overflow-auto transition-all ${selectedRow ? 'max-w-[calc(100%-420px)]' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">ABC-анализ</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Классификация по выручке и маржинальности</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.label, p.days)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  activePreset === p.label
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}>
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset('') }}
                className="text-sm px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100" />
              <span className="text-zinc-400 text-sm">—</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset('') }}
                className="text-sm px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100" />
              <button onClick={applyCustom}
                className="px-3 py-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90">
                Применить
              </button>
            </div>
            <button onClick={() => setShowSettings(s => !s)}
              className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                showSettings
                  ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}>
              ⚙ Пороги
            </button>
          </div>
        </div>

        {/* Threshold settings */}
        {showSettings && (
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Настройка порогов ABC</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 font-medium">По выручке</p>
                <label className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="w-20 shrink-0">A ≤ {thA}%</span>
                  <input type="range" min={60} max={90} step={1} value={thA}
                    onChange={e => setThA(Number(e.target.value))} className="flex-1" />
                </label>
                <label className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="w-20 shrink-0">A+B ≤ {thB}%</span>
                  <input type="range" min={thA + 2} max={99} step={1} value={thB}
                    onChange={e => setThB(Number(e.target.value))} className="flex-1" />
                </label>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 font-medium">По маржинальности</p>
                <label className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="w-20 shrink-0">A ≥ {thMA}%</span>
                  <input type="range" min={10} max={60} step={1} value={thMA}
                    onChange={e => setThMA(Number(e.target.value))} className="flex-1" />
                </label>
                <label className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="w-20 shrink-0">B ≥ {thMB}%</span>
                  <input type="range" min={0} max={thMA - 2} step={1} value={thMB}
                    onChange={e => setThMB(Number(e.target.value))} className="flex-1" />
                </label>
              </div>
            </div>
            <button onClick={applyThresholds}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Пересчитать
            </button>
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            {(['A', 'B', 'C'] as const).map(cls => {
              const s = summary[cls]
              const style = {
                A: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
                B: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400',
                C: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
              }[cls]
              const desc = { A: `топ ${thA}%`, B: `${thA}–${thB}%`, C: 'хвост' }[cls]
              return (
                <div key={cls} className={`rounded-xl border p-4 ${style}`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-2xl font-bold">{cls}</span>
                    <span className="text-xs opacity-60">{desc}</span>
                  </div>
                  <div className="text-xl font-semibold">{s.count} SKU</div>
                  <div className="text-sm opacity-70">{fmtM(s.revenue)} ₽</div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-zinc-400 animate-pulse">Загружаем данные...</div>
        ) : (
          <AbcTable
            rows={rows}
            missingCost={missingCost}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onRowClick={setSelectedRow}
            selectedNmId={selectedRow?.nm_id ?? null}
          />
        )}
      </div>

      {/* Right panel */}
      {selectedRow && (
        <AbcPanel row={selectedRow} onClose={() => setSelectedRow(null)} dateFrom={dateFrom} dateTo={dateTo} />
      )}
    </div>
  )
}

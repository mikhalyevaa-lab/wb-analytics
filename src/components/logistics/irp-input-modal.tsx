'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  defaultDate?: string
}

function getMondayOfWeek(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export function IrpInputModal({ open, onClose, onSaved, defaultDate }: Props) {
  const [tab, setTab] = useState<'current' | 'history'>('current')
  const [weekDate, setWeekDate] = useState(defaultDate ?? getMondayOfWeek())
  const [irp, setIrp] = useState('')
  const [loc, setLoc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Bulk history: array of { week_date, irp, loc }
  const [bulk, setBulk] = useState('')
  const [bulkError, setBulkError] = useState('')

  if (!open) return null

  async function saveCurrent() {
    if (!irp && !loc) { setError('Введите хотя бы одно значение'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/logistics/indexes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_date: weekDate,
          irp: irp ? parseFloat(irp) : undefined,
          localization_index: loc ? parseFloat(loc) : undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function saveBulk() {
    setBulkError('')
    // Format: one line per week — "2026-01-06 1.23 45.6"
    const lines = bulk.trim().split('\n').filter(Boolean)
    const rows: { week_date: string; irp?: number; localization_index?: number }[] = []
    for (const line of lines) {
      const parts = line.trim().split(/[\s,;]+/)
      if (parts.length < 2) { setBulkError(`Неверный формат строки: "${line}"`); return }
      const [date, irpVal, locVal] = parts
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setBulkError(`Неверная дата: "${date}" — нужен формат ГГГГ-ММ-ДД`); return }
      rows.push({
        week_date: date,
        irp: irpVal ? parseFloat(irpVal) : undefined,
        localization_index: locVal ? parseFloat(locVal) : undefined,
      })
    }
    if (!rows.length) { setBulkError('Нет данных для сохранения'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/logistics/indexes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSaved()
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Ввод индексов WB</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>

        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(['current', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-indigo-600 border-b-2 border-indigo-500'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t === 'current' ? 'Текущая неделя' : 'История (с 2026)'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'current' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Дата недели (понедельник)</label>
                <input
                  type="date"
                  value={weekDate}
                  onChange={e => setWeekDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">ИРП</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="напр. 1.23"
                    value={irp}
                    onChange={e => setIrp(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Индекс локализации (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="напр. 45.6"
                    value={loc}
                    onChange={e => setLoc(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={saveCurrent}
                disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Данные по неделям — по одной строке:
                </label>
                <p className="text-xs text-zinc-400 mb-2">
                  <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">ГГГГ-ММ-ДД ИРП ЛОКАЛИЗАЦИЯ</code>
                  <br />
                  Пример: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">2026-01-06 1.15 42.3</code>
                </p>
                <textarea
                  rows={8}
                  value={bulk}
                  onChange={e => setBulk(e.target.value)}
                  placeholder={'2026-01-06 1.15 42.3\n2026-01-13 1.18 43.1\n2026-01-20 1.21 44.5'}
                  className="w-full px-3 py-2 text-sm font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}
              <button
                onClick={saveBulk}
                disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Сохранение…' : `Сохранить историю`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

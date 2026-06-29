'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { PageHeader } from '@/components/ui/page-header'

interface PlanRow {
  week_label: string
  week_number: number
  year: number
  supplier_article: string | null
  nm_id: number | null
  orders_per_week: number
  orders_per_day: number
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(v: string) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange(next)
  }

  const active = selected.size > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-2 ${
          active
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
            : 'border-border bg-background hover:bg-muted/30'
        }`}
      >
        {label}
        {active && (
          <span className="bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {selected.size}
          </span>
        )}
        <span className="text-xs opacity-50">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-xl shadow-lg min-w-[180px] max-h-60 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Нет вариантов</div>
          )}
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.has(o)}
                onChange={() => toggle(o)}
                className="accent-indigo-500"
              />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SalesPlanPage() {
  const [rows, setRows] = useState<PlanRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadSuccess, setUploadSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Фильтры
  const [filterWeeks, setFilterWeeks] = useState<Set<string>>(new Set())
  const [filterNmId, setFilterNmId] = useState<Set<string>>(new Set())
  const [filterArticle, setFilterArticle] = useState<Set<string>>(new Set())

  async function loadList() {
    setLoadingList(true)
    try {
      const res = await fetch('/api/sales-plan/list')
      const d = await res.json()
      setRows(d.rows ?? [])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { loadList() }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadErrors([])
    setUploadSuccess('')

    const form = new FormData()
    form.append('file', file)

    const res = await fetch('/api/sales-plan/upload', { method: 'POST', body: form })
    const d = await res.json()
    setUploading(false)

    if (d.ok) {
      setUploadSuccess(`План загружен: ${d.inserted} строк`)
      loadList()
    } else {
      setUploadErrors(d.errors ?? ['Ошибка загрузки'])
    }

    if (fileRef.current) fileRef.current.value = ''
  }

  // Опции для фильтров
  const weekOptions = useMemo(() => [...new Set(rows.map(r => r.week_label))].sort((a, b) => {
    const pa = a.match(/^(\d+)\s*\((\d+)\)/)
    const pb = b.match(/^(\d+)\s*\((\d+)\)/)
    if (!pa || !pb) return 0
    return (parseInt(pa[2]) * 100 + parseInt(pa[1])) - (parseInt(pb[2]) * 100 + parseInt(pb[1]))
  }), [rows])
  const nmIdOptions = useMemo(() => [...new Set(rows.map(r => String(r.nm_id ?? '')).filter(Boolean))].sort(), [rows])
  const articleOptions = useMemo(() => [...new Set(rows.map(r => r.supplier_article ?? '').filter(Boolean))].sort(), [rows])

  const hasFilters = filterWeeks.size > 0 || filterNmId.size > 0 || filterArticle.size > 0

  function resetFilters() {
    setFilterWeeks(new Set())
    setFilterNmId(new Set())
    setFilterArticle(new Set())
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filterWeeks.size > 0 && !filterWeeks.has(r.week_label)) return false
    if (filterNmId.size > 0 && !filterNmId.has(String(r.nm_id ?? ''))) return false
    if (filterArticle.size > 0 && !filterArticle.has(r.supplier_article ?? '')) return false
    return true
  }), [rows, filterWeeks, filterNmId, filterArticle])

  // Группировка по неделе
  const grouped = useMemo(() => {
    const map = new Map<string, PlanRow[]>()
    for (const r of filtered) {
      const key = r.week_label
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div className="p-6 max-w-[1000px] space-y-6">
      <PageHeader
        picto="sales-plan"
        title="План продаж"
        subtitle="Загрузка и просмотр плана по артикулам и неделям"
      />

      {/* Шаблон + загрузка */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="font-medium text-sm">Загрузка плана</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Скачайте шаблон, заполните план и загрузите файл. <strong>Можно загружать только текущую или будущие недели.</strong></p>
          <p className="text-xs">Формат недели: <code className="bg-muted px-1 py-0.5 rounded text-xs">25 (26)</code> — неделя 25, год 2026.</p>
          <p className="text-xs">Поля «Заказы в неделю» и «Заказы в день» — целые числа ≥ 0.</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <a
            href="/api/sales-plan/template"
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted/30 transition-colors"
          >
            ↓ Скачать шаблон
          </a>
          <label className={`px-4 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
            uploading
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}>
            {uploading ? 'Загружаем…' : '↑ Загрузить план'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>

        {uploadSuccess && (
          <div className="text-sm bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5 text-green-700 dark:text-green-400">
            ✓ {uploadSuccess}
          </div>
        )}

        {uploadErrors.length > 0 && (
          <div className="text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 space-y-1">
            <div className="font-medium text-red-700 dark:text-red-400">План не загружен. Ошибки:</div>
            <ul className="list-disc pl-4 space-y-0.5 text-red-600 dark:text-red-400">
              {uploadErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Загруженный план */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-medium text-sm">
            Загруженный план
            {rows.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">{rows.length} позиций</span>
            )}
          </div>

          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <MultiSelect label="Неделя" options={weekOptions} selected={filterWeeks} onChange={setFilterWeeks} />
              <MultiSelect label="Артикул ВБ" options={nmIdOptions} selected={filterNmId} onChange={setFilterNmId} />
              <MultiSelect label="Артикул поставщика" options={articleOptions} selected={filterArticle} onChange={setFilterArticle} />
              {hasFilters && (
                <button
                  onClick={resetFilters}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  Сбросить все фильтры
                </button>
              )}
            </div>
          )}
        </div>

        {loadingList ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Загружаем…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            План ещё не загружен. Скачайте шаблон, заполните и загрузите файл.
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Ничего не найдено по выбранным фильтрам.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Неделя</th>
                  <th className="text-left px-3 py-2.5 font-medium">Артикул поставщика</th>
                  <th className="text-left px-3 py-2.5 font-medium">Артикул ВБ</th>
                  <th className="text-right px-3 py-2.5 font-medium">Заказы / неделю</th>
                  <th className="text-right px-4 py-2.5 font-medium">Заказы / день</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([week, weekRows]) => {
                  const totalWeek = weekRows.reduce((s, r) => s + r.orders_per_week, 0)
                  const totalDay = weekRows.reduce((s, r) => s + r.orders_per_day, 0)
                  return (
                    <>
                      {weekRows.map((r, idx) => (
                        <tr key={`${week}-${r.nm_id}-${idx}`} className="hover:bg-muted/10 border-b border-border/40">
                          {idx === 0 ? (
                            <td
                              className="px-4 py-2.5 font-medium text-indigo-600 dark:text-indigo-400 align-top"
                              rowSpan={weekRows.length}
                            >
                              {week}
                            </td>
                          ) : null}
                          <td className="px-3 py-2.5 text-muted-foreground">{r.supplier_article ?? '—'}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{r.nm_id ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right font-medium">{r.orders_per_week}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{r.orders_per_day}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/20 border-b-2 border-border text-xs font-semibold">
                        <td className="px-4 py-2 text-muted-foreground">Итого {week}</td>
                        <td className="px-3 py-2 text-muted-foreground" colSpan={2}>{weekRows.length} позиций</td>
                        <td className="px-3 py-2 text-right">{totalWeek}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{totalDay}</td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

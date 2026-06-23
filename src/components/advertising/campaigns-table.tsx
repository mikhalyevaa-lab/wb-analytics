'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Campaign {
  campaign_id: number
  campaign_name: string
  spend: number
  views: number
  clicks: number
  orders_count: number
  orders_sum: number
  cpm: number
  cpc: number
  ctr: number
  drr: number | null
}

interface Totals {
  spend: number; views: number; clicks: number; orders_count: number; orders_sum: number
}

interface NmRow {
  nm_id: number
  nm_name: string | null
  spend: number
  views: number
  clicks: number
  orders_count: number
  orders_sum: number
}

function fmt(n: number, dec = 0) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function isNameless(c: Campaign) {
  return !c.campaign_name || c.campaign_name === String(c.campaign_id)
}

function cpcColor(cpc: number) {
  if (cpc === 0) return ''
  if (cpc < 5)  return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  if (cpc < 10) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
}
function ctrColor(ctr: number) {
  if (ctr === 0) return ''
  if (ctr >= 4) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  if (ctr >= 2) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
}
function viewsColor(views: number) {
  if (views === 0) return ''
  if (views >= 300_000) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
}
function drrColor(drr: number | null) {
  if (drr === null) return ''
  if (drr <= 15) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  if (drr <= 25) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
}

function ColorCell({ value, colorClass, suffix = '' }: { value: string; colorClass: string; suffix?: string }) {
  if (!colorClass) return <span>{value}{suffix}</span>
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${colorClass}`}>{value}{suffix}</span>
}

// Inline name editor for a single campaign
function NameCell({ c, onSave }: { c: Campaign; onSave: (id: number, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(isNameless(c) ? '' : c.campaign_name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    const trimmed = val.trim()
    if (trimmed && trimmed !== c.campaign_name) onSave(c.campaign_id, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[200px]">
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 text-xs border border-indigo-400 rounded px-1.5 py-0.5 bg-white dark:bg-zinc-900 outline-none"
          placeholder="Введите название…"
        />
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 group cursor-pointer min-w-[180px] max-w-[280px]"
      onClick={() => setEditing(true)}
      title={isNameless(c) ? `Нажмите чтобы добавить название (ID: ${c.campaign_id})` : c.campaign_name}
    >
      {isNameless(c) ? (
        <span className="text-zinc-400 dark:text-zinc-500 italic text-xs">Без названия</span>
      ) : (
        <span className="truncate text-xs">{c.campaign_name}</span>
      )}
      <span className="opacity-0 group-hover:opacity-60 text-[10px] shrink-0">✏️</span>
    </div>
  )
}

type SortKey = keyof Campaign
type SortDir = 'asc' | 'desc'

const PRESETS = [
  { label: 'Сегодня', days: 0 },
  { label: '7 дн',    days: 7 },
  { label: '14 дн',   days: 14 },
  { label: '30 дн',   days: 30 },
  { label: '90 дн',   days: 90 },
]

export function CampaignsTable() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [activeDays, setActiveDays] = useState(30)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [csvMsg, setCsvMsg] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [nmCache, setNmCache] = useState<Map<number, NmRow[]>>(new Map())
  const [nmLoading, setNmLoading] = useState<Set<number>>(new Set())

  // Always use Moscow time (UTC+3) to match server-side date logic
  function moscowDate(offsetDays = 0) {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000)
    d.setUTCDate(d.getUTCDate() - offsetDays)
    return d.toISOString().split('T')[0]
  }
  function todayDate() { return moscowDate(0) }
  function daysAgo(n: number) { return moscowDate(n) }

  function effectiveDates() {
    return { from: dateFrom || daysAgo(activeDays), to: dateTo || todayDate() }
  }

  function load() {
    const { from, to } = effectiveDates()
    setLoading(true)
    // Reset expanded state when period changes
    setExpandedIds(new Set())
    setNmCache(new Map())
    fetch(`/api/advertising/campaigns?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setCampaigns(d.campaigns ?? []); setTotals(d.totals ?? null); setLastSyncDate(d.lastSyncDate ?? null); setLastSyncAt(d.lastSyncAt ?? null) })
      .finally(() => setLoading(false))
  }

  async function toggleExpand(campaignId: number) {
    if (expandedIds.has(campaignId)) {
      setExpandedIds(prev => { const s = new Set(prev); s.delete(campaignId); return s })
      return
    }
    setExpandedIds(prev => new Set([...prev, campaignId]))
    if (nmCache.has(campaignId)) return

    setNmLoading(prev => new Set([...prev, campaignId]))
    const { from, to } = effectiveDates()
    try {
      const res = await fetch(`/api/advertising/campaigns/${campaignId}/nms?from=${from}&to=${to}`)
      const data = await res.json()
      setNmCache(prev => new Map([...prev, [campaignId, data.nms ?? []]]))
    } finally {
      setNmLoading(prev => { const s = new Set(prev); s.delete(campaignId); return s })
    }
  }

  useEffect(() => { load() }, [activeDays, dateFrom, dateTo]) // eslint-disable-line

  // Save a single campaign name
  async function handleSaveName(campaign_id: number, name: string) {
    const res = await fetch('/api/advertising/campaign-names', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ campaign_id, name }] }),
    })
    if (res.ok) {
      setCampaigns(prev => prev.map(c =>
        c.campaign_id === campaign_id ? { ...c, campaign_name: name } : c
      ))
    }
  }

  // CSV import: column A = campaign_id, column B = name (semicolon or comma separated)
  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(Boolean)
    const updates: { campaign_id: number; name: string }[] = []
    const sep = text.includes(';') ? ';' : ','

    for (const line of lines) {
      const parts = line.split(sep)
      const rawId = parts[0]?.trim().replace(/^["']|["']$/g, '')
      const rawName = parts[1]?.trim().replace(/^["']|["']$/g, '')
      const id = parseInt(rawId)
      if (!isNaN(id) && rawName) updates.push({ campaign_id: id, name: rawName })
    }

    if (!updates.length) { setCsvMsg('Не удалось распознать файл'); return }

    const res = await fetch('/api/advertising/campaign-names', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    const d = await res.json()
    setCsvMsg(`Обновлено ${d.updated} кампаний`)
    setTimeout(() => { setCsvMsg(''); load() }, 2000)
    if (csvRef.current) csvRef.current.value = ''
  }

  // Export CSV with "template" for missing names
  const exportNamesTemplate = () => {
    const nameless = campaigns.filter(isNameless)
    if (!nameless.length) { setCsvMsg('Все кампании уже имеют названия!'); return }
    const rows = nameless.map(c => `${c.campaign_id};`)
    const csv = 'ID кампании;Название\n' + rows.join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'campaign_names_template.csv'; a.click()
    URL.revokeObjectURL(url)
    setCsvMsg(`Шаблон содержит ${nameless.length} кампаний без названий`)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return campaigns
    return campaigns.filter(c =>
      String(c.campaign_id).includes(q) ||
      (c.campaign_name && !isNameless(c) && c.campaign_name.toLowerCase().includes(q))
    )
  }, [campaigns, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0
      return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
    })
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const exportCSV = () => {
    const header = ['Название РК', 'Номер РК', 'Сумма ₽', 'Показы', 'CPM ₽', 'Клики', 'Цена клика ₽', 'CTR %', 'Заказы шт', 'Заказы ₽', 'ДРР %']
    const rows = sorted.map(c => [
      isNameless(c) ? '' : c.campaign_name, c.campaign_id,
      c.spend, c.views, c.cpm, c.clicks, c.cpc, c.ctr,
      c.orders_count, c.orders_sum, c.drr ?? '',
    ])
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `campaigns_${activeDays}d.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const namelessCount = campaigns.filter(isNameless).length

  const thBase = 'sticky top-0 z-10 bg-muted border-b border-border'
  const th = (label: string, key: SortKey, cls = '') => (
    <th
      key={key}
      className={`${thBase} px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap ${cls}`}
      onClick={() => handleSort(key)}
    >
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const totalCpm = totals && totals.views   > 0 ? totals.spend / totals.views * 1000 : 0
  const totalCpc = totals && totals.clicks  > 0 ? totals.spend / totals.clicks : 0
  const totalCtr = totals && totals.views   > 0 ? totals.clicks / totals.views * 100 : 0
  const totalDrr = totals && totals.orders_sum > 0 ? totals.spend / totals.orders_sum * 100 : null

  const syncLabel = (() => {
    if (!lastSyncDate) return null
    const dateStr = new Date(lastSyncDate).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    if (!lastSyncAt) return dateStr
    const moscowTime = new Date(new Date(lastSyncAt).getTime() + 3 * 60 * 60 * 1000)
    const timeStr = moscowTime.toISOString().slice(11, 16) + ' мск'
    return `${dateStr}, ${timeStr}`
  })()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-semibold">Анализ РК</h2>
        {syncLabel && (
          <span className="text-xs text-muted-foreground">данные по {syncLabel}</span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => { setActiveDays(p.days); setDateFrom(''); setDateTo('') }}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${activeDays === p.days && !dateFrom ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background" />
        <span className="text-muted-foreground text-sm">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background" />
        <Input
          placeholder="Поиск по ID или названию РК…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64"
        />
      </div>


      {/* Actions row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} кампаний</span>
        <Button variant="outline" size="sm" onClick={exportCSV}>↓ CSV</Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-auto" style={{maxHeight:'calc(100vh - 280px)'}}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={`${thBase} w-8 px-2 py-2.5`} />
              <th className={`${thBase} px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[200px]`}>
                Название РК
                <span className="text-[10px] font-normal text-zinc-400 ml-1">(кликните для редактирования)</span>
              </th>
              {th('ID РК', 'campaign_id', 'w-28')}
              {th('Сумма ₽', 'spend', 'text-right w-28')}
              {th('Показы', 'views', 'text-right w-28')}
              {th('CPM ₽', 'cpm', 'text-right w-24')}
              {th('Клики', 'clicks', 'text-right w-24')}
              {th('CPC ₽', 'cpc', 'text-right w-24')}
              {th('CTR %', 'ctr', 'text-right w-20')}
              {th('Заказы шт', 'orders_count', 'text-right w-24')}
              {th('Заказы ₽', 'orders_sum', 'text-right w-28')}
              {th('ДРР %', 'drr', 'text-right w-20')}
            </tr>
          </thead>
          <tbody>
            {totals && (
              <tr className="bg-muted/40 font-semibold border-b border-border text-xs">
                <td className="px-2 py-2" />
                <td className="px-3 py-2 text-muted-foreground">Итого за период</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right">{fmt(totals.spend)}</td>
                <td className="px-3 py-2 text-right"><ColorCell value={fmt(totals.views)} colorClass={viewsColor(totals.views)} /></td>
                <td className="px-3 py-2 text-right">{fmt(totalCpm, 2)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.clicks)}</td>
                <td className="px-3 py-2 text-right"><ColorCell value={fmt(totalCpc, 2)} colorClass={cpcColor(totalCpc)} /></td>
                <td className="px-3 py-2 text-right"><ColorCell value={fmt(totalCtr, 2)} suffix="%" colorClass={ctrColor(totalCtr)} /></td>
                <td className="px-3 py-2 text-right">{fmt(totals.orders_count)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.orders_sum)}</td>
                <td className="px-3 py-2 text-right"><ColorCell value={totalDrr !== null ? fmt(totalDrr, 1) : '—'} suffix={totalDrr !== null ? '%' : ''} colorClass={drrColor(totalDrr)} /></td>
              </tr>
            )}

            {loading ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground text-sm">Загрузка…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground text-sm">
                {campaigns.length === 0 ? 'Нет данных по рекламе. Запустите синхронизацию в Настройках.' : 'Ничего не найдено'}
              </td></tr>
            ) : sorted.map(c => {
              const isExpanded = expandedIds.has(c.campaign_id)
              const isNmLoading = nmLoading.has(c.campaign_id)
              const nms = nmCache.get(c.campaign_id) ?? []
              return (
                <>
                  <tr key={c.campaign_id} className="border-b border-border hover:bg-muted/20 transition-colors text-xs">
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => toggleExpand(c.campaign_id)}
                        className="text-muted-foreground hover:text-foreground transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
                        title={isExpanded ? 'Свернуть артикулы' : 'Показать артикулы'}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <NameCell c={c} onSave={handleSaveName} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.campaign_id}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><ColorCell value={fmt(c.views)} colorClass={viewsColor(c.views)} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.cpm > 0 ? fmt(c.cpm, 2) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><ColorCell value={c.cpc > 0 ? fmt(c.cpc, 2) : '—'} colorClass={cpcColor(c.cpc)} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><ColorCell value={c.ctr > 0 ? fmt(c.ctr, 2) : '—'} suffix={c.ctr > 0 ? '%' : ''} colorClass={ctrColor(c.ctr)} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.orders_count)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.orders_sum > 0 ? fmt(c.orders_sum) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <ColorCell value={c.drr !== null ? fmt(c.drr, 1) : '—'} suffix={c.drr !== null ? '%' : ''} colorClass={drrColor(c.drr)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    isNmLoading ? (
                      <tr key={`nm-loading-${c.campaign_id}`} className="bg-muted/5">
                        <td colSpan={12} className="pl-10 py-2 text-xs text-muted-foreground">Загрузка артикулов…</td>
                      </tr>
                    ) : nms.length === 0 ? (
                      <tr key={`nm-empty-${c.campaign_id}`} className="border-b border-border bg-muted/5">
                        <td colSpan={12} className="pl-10 py-2 text-xs text-muted-foreground">Нет данных по артикулам за период</td>
                      </tr>
                    ) : nms.map((nm, i) => (
                      <tr key={`nm-${c.campaign_id}-${nm.nm_id}`}
                        className={`bg-muted/5 hover:bg-muted/15 transition-colors text-xs ${i === nms.length - 1 ? 'border-b border-border' : 'border-b border-border/30'}`}>
                        {/* col 1: indent marker */}
                        <td className="px-2 py-1.5 text-center text-muted-foreground/40 text-[10px]">└</td>
                        {/* col 2: название (nm_name) */}
                        <td className="px-3 py-1.5 max-w-[200px] truncate text-muted-foreground" title={nm.nm_name ?? ''}>{nm.nm_name ?? '—'}</td>
                        {/* col 3: ID (nm_id) */}
                        <td className="px-3 py-1.5 font-mono text-muted-foreground tabular-nums">{nm.nm_id}</td>
                        {/* col 4: затраты (= Сумма ₽) */}
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(nm.spend)}</td>
                        {/* col 5: показы */}
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(nm.views)}</td>
                        {/* col 6: CPM — нет на уровне nm */}
                        <td className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>
                        {/* col 7: клики */}
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(nm.clicks)}</td>
                        {/* col 8: CPC — нет на уровне nm */}
                        <td className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>
                        {/* col 9: CTR — нет на уровне nm */}
                        <td className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>
                        {/* col 10: заказы шт */}
                        <td className="px-3 py-1.5 text-right tabular-nums">{nm.orders_count}</td>
                        {/* col 11: заказы ₽ */}
                        <td className="px-3 py-1.5 text-right tabular-nums">{nm.orders_sum > 0 ? fmt(nm.orders_sum) : '—'}</td>
                        {/* col 12: ДРР — нет на уровне nm */}
                        <td className="px-3 py-1.5 text-right text-muted-foreground/40">—</td>
                      </tr>
                    ))
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

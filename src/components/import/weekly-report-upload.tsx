'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

type Result = { ok: boolean; inserted: number; skipped: number; reportNumber: number | null; error?: string }

export function WeeklyReportUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Result | null>(null)
  const [reportNumberForZip, setReportNumberForZip] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('loading')
    setResult(null)

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const fd = new FormData()
        fd.append('file', file)
        if (reportNumberForZip) fd.append('reportNumber', reportNumberForZip)
        const res = await fetch('/api/import/wb-weekly-report-zip', { method: 'POST', body: fd })
        const data = await res.json() as Result
        setResult(data)
        setStatus(data.ok ? 'done' : 'error')
        return
      }

      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][]

      if (!raw.length) { setStatus('error'); setResult({ ok: false, inserted: 0, skipped: 0, reportNumber: null, error: 'Пустой файл' }); return }

      const headers = (raw[0] ?? []).map(h => String(h ?? '').trim())
      const firstHeader = headers[0] ?? ''

      const isDetail = file.name.toLowerCase().includes('детализированный') || (firstHeader === '№' && !firstHeader.startsWith('№ отч'))
      const fileType = isDetail ? 'detail' : 'summary'

      let reportNumber: number | undefined
      if (isDetail) {
        const match = file.name.match(/№(\d+)/)
        reportNumber = match ? Number(match[1]) : undefined
        if (!reportNumber && reportNumberForZip) reportNumber = Number(reportNumberForZip)
        if (!reportNumber) {
          setStatus('error')
          setResult({ ok: false, inserted: 0, skipped: 0, reportNumber: null, error: 'Не удалось определить номер отчёта из имени файла. Укажите его вручную.' })
          return
        }
      }

      const dataRows = isDetail ? raw.slice(1) : raw

      const res = await fetch('/api/import/wb-weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType, reportNumber, rows: dataRows, headers }),
      })
      const data = await res.json() as Result
      setResult(data)
      setStatus(data.ok ? 'done' : 'error')
    } catch (e) {
      setResult({ ok: false, inserted: 0, skipped: 0, reportNumber: null, error: String(e) })
      setStatus('error')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.zip"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <input
          type="text"
          placeholder="Номер отчёта (для ZIP / детализации без номера в имени)"
          value={reportNumberForZip}
          onChange={e => setReportNumberForZip(e.target.value)}
          className="flex-1 min-w-[260px] text-sm px-3 py-2 rounded-lg border border-border bg-background"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === 'loading'}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-50"
        >
          {status === 'loading' ? 'Загружаем…' : 'Выбрать файл'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Принимаем сводный XLSX (Еженедельный отчет…) или детализированный XLSX/ZIP</p>

      {result && (
        <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-red-500/30 bg-red-500/5 text-red-400'}`}>
          {result.ok
            ? `Загружено: ${result.inserted} строк, пропущено: ${result.skipped}${result.reportNumber ? `, отчёт №${result.reportNumber}` : ''}`
            : `Ошибка: ${result.error ?? 'неизвестная ошибка'}`}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'

const API_AUTO_START = '2026-07-01'

type NeededDate = { month: string; suggested_date: string; covered: boolean; available: boolean }
type UploadRecord = { effective_date: string; filename: string; rows_count: number; uploaded_at: string }

type Coverage = {
  firstOrderDate: string | null
  apiAutoStart: string
  coveredMonths: string[]
  gapMonths: string[]
  neededDates: NeededDate[]
  missingDays: string[]
  uploads: UploadRecord[]
  allCovered: boolean
  stats: { total_months: number; covered_months: number; missing_months: number; missing_days: number; window_start: string; window_end: string }
}

const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTH_RU[parseInt(m) - 1]} ${y.slice(2)}`
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}
// "2025-07-01" → "01/07/25"
function fmtDdMmYy(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

export function TariffUpload() {
  const [cov, setCov] = useState<Coverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [missingList, setMissingList] = useState<{ date: string; available: boolean }[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleCheck = async () => {
    setChecking(true)
    setMissingList(null)
    try {
      const r = await fetch('/api/tariffs/coverage')
      const d: Coverage = await r.json()
      // Пропущенные дни в окне (свежие сначала), без ограничения по 10
      const days = [...(d.missingDays ?? [])]
        .reverse()
        .map(date => ({ date: fmtDdMmYy(date), available: true }))
      setMissingList(days)
    } catch {
      setMissingList([])
    } finally {
      setChecking(false)
    }
  }

  const load = () => {
    setLoading(true)
    fetch('/api/tariffs/coverage')
      .then(r => r.json())
      .then(d => { setCov(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await fetch('/api/tariffs/upload', { method: 'POST', body: form })
      const d = await r.json()
      if (d.ok) {
        setMsg({ ok: true, text: `Загружено ${d.rows} складов на дату ${d.effective_date}` })
        load()
      } else {
        setMsg({ ok: false, text: d.error ?? 'Ошибка загрузки' })
      }
    } catch {
      setMsg({ ok: false, text: 'Ошибка при отправке файла' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        <div className="h-4 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
      </div>
    )
  }

  if (!cov) return null

  // Строим данные для таймлайна
  const today = new Date().toISOString().split('T')[0]
  const startDate = cov.firstOrderDate ?? '2025-07-01'
  const totalMs = new Date(today).getTime() - new Date(startDate).getTime()
  const gapEndMs = new Date(API_AUTO_START).getTime() - new Date(startDate).getTime()
  const gapPct = Math.min(100, (gapEndMs / totalMs) * 100)

  // Ширина покрытых сегментов внутри пробела
  const coveredInGap = cov.gapMonths?.filter(m => cov.coveredMonths.includes(m)) ?? []
  const missingInGap = cov.gapMonths?.filter(m => !cov.coveredMonths.includes(m)) ?? []
  const coveredPct = cov.gapMonths?.length
    ? (coveredInGap.length / cov.gapMonths.length) * gapPct
    : 0
  const missingPct = gapPct - coveredPct
  const autoPct = 100 - gapPct

  // Метки месяцев (каждые 3 месяца в пробеле + начало API)
  const labelMonths: { label: string; pct: number }[] = []
  if (cov.gapMonths) {
    cov.gapMonths.forEach((m, i) => {
      if (i % 3 === 0) {
        const pct = ((i / cov.gapMonths.length) * gapPct)
        labelMonths.push({ label: fmtMonth(m), pct })
      }
    })
  }
  labelMonths.push({ label: 'авт.', pct: gapPct + 1 })

  const uploadedMonths = new Set(
    (cov.uploads ?? []).map(u => u.effective_date.slice(0, 7))
  )

  return (
    <div className="space-y-4">
      {/* Заголовок + кнопка */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Файл: <span className="font-mono">warehouse coefficients YYYY-MM-DD.xlsx</span> — дата берётся автоматически из имени
          </p>
        </div>
        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0
          ${uploading
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}>
          {uploading ? (
            <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>Загружаю…</>
          ) : (
            <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Загрузить файл</>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading} onChange={handleFile} />
        </label>
      </div>

      {/* Сообщение после загрузки */}
      {msg && (
        <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
          msg.ok
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {msg.ok ? '✓' : '✗'} {msg.text}
        </div>
      )}

      {/* ── Таймлайн ── */}
      <div>
        <div className="flex items-stretch gap-0.5 h-7 rounded-lg overflow-hidden">
          {/* Красный — пробел без данных */}
          {missingPct > 0 && (
            <div style={{ width: `${missingPct}%` }}
              className="bg-red-400 dark:bg-red-600 relative group cursor-default"
              title="Нет тарифных данных">
            </div>
          )}
          {/* Зелёный — вручную закрытые месяцы */}
          {coveredPct > 0 && (
            <div style={{ width: `${coveredPct}%` }}
              className="bg-emerald-400 dark:bg-emerald-600"
              title="Загружено вручную">
            </div>
          )}
          {/* Синий — API авто */}
          {autoPct > 0 && (
            <div style={{ width: `${autoPct}%` }}
              className="bg-blue-400 dark:bg-blue-600"
              title="Автосинк по API">
            </div>
          )}
        </div>

        {/* Подписи месяцев */}
        <div className="relative h-5 mt-1">
          {labelMonths.map(({ label, pct }) => (
            <span
              key={label}
              style={{ left: `${Math.min(pct, 96)}%` }}
              className="absolute text-[10px] text-zinc-400 whitespace-nowrap -translate-x-1/2">
              {label}
            </span>
          ))}
        </div>

        {/* Легенда */}
        <div className="flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400 dark:bg-red-600" />
            нет данных
          </span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
            загружено вручную
          </span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400 dark:bg-blue-600" />
            API авто
          </span>
        </div>
      </div>

      {/* ── Проверка пробелов ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50 shrink-0"
        >
          {checking ? (
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          )}
          Проверить пробелы
        </button>

        {missingList !== null && (
          missingList.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              Ручная загрузка не требуется
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 flex-1">
              {missingList.map(({ date, available }, i) => (
                available ? (
                  // Доступно — красный, можно загрузить
                  <span key={date}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                    <span className="text-[10px] text-red-400 dark:text-red-600 font-sans">{i + 1}</span>
                    {date}
                  </span>
                ) : (
                  // Недоступно — серый, WB не предоставляет (>90 дней)
                  <span key={date}
                    title="WB хранит тарифы только 90 дней — файл недоступен"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-600 line-through cursor-not-allowed">
                    <svg className="h-2.5 w-2.5 shrink-0 no-underline" style={{textDecoration:'none'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    </svg>
                    {date}
                  </span>
                )
              ))}
            </div>
          )
        )}
      </div>

      {/* История загрузок */}
      {(cov.uploads ?? []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Загруженные файлы</p>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
            <table className="w-full">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cov.uploads.map(u => (
                  <tr key={u.effective_date} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300 w-28">{fmtDate(u.effective_date)}</td>
                    <td className="px-3 py-2 text-zinc-400 truncate max-w-0 w-full">{u.filename}</td>
                    <td className="px-3 py-2 text-right text-zinc-500 whitespace-nowrap">{u.rows_count} скл.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

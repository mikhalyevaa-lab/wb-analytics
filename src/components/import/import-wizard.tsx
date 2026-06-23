'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'

// wb_orders_file = специализированный формат «Новая таблица» с barcode (float), techSize, srid
type Step = 'upload' | 'preview' | 'mapping' | 'importing' | 'done'

interface ColDef { index: number; header: string; field: string | null }

interface DetectResult {
  type: string
  label: string
  confidence: string
  keyField: string
  uniqueKey: string
  columns: ColDef[]
}

interface ImportResult { inserted: number; skipped: number; errors: number; total: number }

const FINANCE_FIELDS = [
  'rrd_id', 'realizationreport_id', 'nm_id', 'brand_name', 'sa_name', 'subject_name',
  'doc_type_name', 'supplier_oper_name', 'quantity', 'retail_price', 'retail_amount',
  'ppvz_for_pay', 'delivery_rub', 'penalty', 'additional_payment', 'storage_fee',
  'acceptance', 'deduction', 'commission_percent', 'date_from', 'date_to', 'sale_dt', 'order_dt',
]
const ORDERS_FIELDS = [
  'date', 'nm_id', 'supplier_article', 'barcode', 'subject', 'category', 'brand',
  'total_price', 'discount_percent', 'spp', 'is_cancel', 'g_number', 'srid',
  'warehouse_name', 'region_name',
]
const AD_FIELDS = ['campaign_id', 'campaign_name', 'date', 'spend', 'views', 'clicks', 'orders_count', 'orders_sum']

const TYPE_FIELDS: Record<string, string[]> = {
  wb_finance: FINANCE_FIELDS,
  wb_orders: ORDERS_FIELDS,
  wb_ad_spend: AD_FIELDS,
}

const FIELD_LABELS: Record<string, string> = {
  rrd_id: 'ID строки (rrd_id) *', realizationreport_id: 'ID отчёта', nm_id: 'Артикул WB',
  brand_name: 'Бренд', sa_name: 'Арт. поставщика', subject_name: 'Предмет',
  doc_type_name: 'Тип документа', supplier_oper_name: 'Операция', quantity: 'Кол-во',
  retail_price: 'Цена розн.', retail_amount: 'Реализовал ВБ', ppvz_for_pay: 'К перечислению',
  delivery_rub: 'Логистика ₽', penalty: 'Штраф', additional_payment: 'Доп. выплата',
  storage_fee: 'Хранение', acceptance: 'Приёмка', deduction: 'Удержание',
  commission_percent: 'Комиссия %', date_from: 'Дата начала', date_to: 'Дата конца',
  sale_dt: 'Дата продажи', order_dt: 'Дата заказа',
  date: 'Дата', supplier_article: 'Арт. поставщика', barcode: 'Баркод',
  subject: 'Предмет', category: 'Категория', brand: 'Бренд', total_price: 'Цена',
  discount_percent: 'Скидка %', spp: 'СПП', is_cancel: 'Отмена', g_number: 'Номер заказа',
  srid: 'SRID *', warehouse_name: 'Склад', region_name: 'Регион',
  campaign_id: 'ID кампании *', campaign_name: 'Название РК', spend: 'Расход ₽',
  views: 'Показы', clicks: 'Клики', orders_count: 'Заказы шт', orders_sum: 'Заказы ₽',
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [rawRows, setRawRows] = useState<unknown[][]>([])
  const [rawRowsNumeric, setRawRowsNumeric] = useState<unknown[][]>([]) // raw=true for float barcodes
  const [headers, setHeaders] = useState<string[]>([])
  const [detect, setDetect] = useState<DetectResult | null>(null)
  const [columns, setColumns] = useState<ColDef[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)

    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wbFile = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wbFile.Sheets[wbFile.SheetNames[0]]

      // formatted rows for preview
      const all: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })
      // raw rows for numeric precision (barcodes)
      const allRaw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })

      if (all.length < 2) { setError('Файл пустой или содержит только заголовки'); return }

      const hdrs = (all[0] as string[]).map(h => String(h ?? '').trim())
      const dataRows = all.slice(1).filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))
      const dataRowsNumeric = allRaw.slice(1).filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))

      setHeaders(hdrs)
      setRawRows(dataRows as unknown[][])
      setRawRowsNumeric(dataRowsNumeric as unknown[][])

      // Detect
      const res = await fetch('/api/import/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: hdrs }),
      })
      const detectData: DetectResult = await res.json()
      setDetect(detectData)
      setColumns(detectData.columns)
      setStep('preview')
    } catch (err) {
      setError('Не удалось прочитать файл: ' + String(err))
    }
  }

  async function handleImport() {
    if (!detect) return
    setImporting(true)
    setStep('importing')

    // Специализированный маршрут для «Новая таблица» с barcode (float)
    const isOrdersFile = detect.type === 'wb_orders_file'
    const sourceRows = isOrdersFile ? rawRowsNumeric : rawRows

    if (isOrdersFile) {
      // Преобразуем в объекты с именами колонок (не индексами)
      const rows = sourceRows.map(r => {
        const obj: Record<string, unknown> = {}
        headers.forEach((h, i) => { obj[h] = (r as unknown[])[i] })
        return obj
      })
      const res = await fetch('/api/import/wb-orders-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      setResult(data)
      setImporting(false)
      setStep('done')
      return
    }

    const rows = sourceRows.map(r => Object.fromEntries((r as unknown[]).map((v, i) => [i, v])))

    const res = await fetch('/api/import/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: detect.type, rows, columns }),
    })
    const data = await res.json()
    setResult(data)
    setImporting(false)
    setStep('done')
  }

  function reset() {
    setStep('upload'); setRawRows([]); setHeaders([]); setDetect(null)
    setColumns([]); setResult(null); setError(null)
  }

  const availableFields = detect ? (TYPE_FIELDS[detect.type] ?? []) : []
  const preview = rawRows.slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className="border-2 border-dashed border-border rounded-2xl p-16 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={async e => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) { const dt = new DataTransfer(); dt.items.add(file); if (fileRef.current) { fileRef.current.files = dt.files; handleFile({ target: fileRef.current } as React.ChangeEvent<HTMLInputElement>) } }
          }}
        >
          <div className="text-5xl mb-4">📂</div>
          <p className="text-lg font-medium">Перетащите файл или нажмите для выбора</p>
          <p className="text-sm text-muted-foreground mt-2">Поддерживаются форматы XLSX, XLS, CSV</p>
          <p className="text-xs text-muted-foreground mt-4">
            Поддерживаемые типы: финансовый отчёт WB, заказы WB, рекламная статистика
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Step 2: Preview + Mapping */}
      {(step === 'preview' || step === 'mapping') && detect && (
        <div className="space-y-5">
          {/* Detected type */}
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${detect.type === 'unknown' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-green-500/40 bg-green-500/5'}`}>
            <span className="text-2xl">{detect.type === 'unknown' ? '⚠️' : '✅'}</span>
            <div>
              <div className="font-semibold">{detect.label}</div>
              <div className="text-xs text-muted-foreground">
                Строк данных: {rawRows.length.toLocaleString('ru')} · Дедупликация по: {detect.uniqueKey}
              </div>
            </div>
          </div>

          {/* Column mapping */}
          {detect.type !== 'unknown' && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Маппинг колонок</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {columns.map((col, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-lg p-2">
                    <span className="text-muted-foreground truncate flex-1" title={col.header}>{col.header}</span>
                    <span className="text-muted-foreground">→</span>
                    <select
                      className="text-xs border border-border rounded px-1 py-0.5 bg-background flex-1"
                      value={col.field ?? ''}
                      onChange={e => setColumns(prev => prev.map((c, ci) => ci === i ? { ...c, field: e.target.value || null } : c))}
                    >
                      <option value="">— пропустить —</option>
                      {availableFields.map(f => (
                        <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Предпросмотр (первые 5 строк)</h3>
            <div className="overflow-auto border border-border rounded-xl">
              <table className="text-xs whitespace-nowrap">
                <thead className="bg-muted/50">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground border-r border-border last:border-0">
                        <div>{h}</div>
                        {columns[i]?.field && (
                          <div className="text-primary font-normal">→ {columns[i].field}</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} className="border-t border-border hover:bg-muted/20">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-1.5 border-r border-border last:border-0 text-muted-foreground max-w-[150px] truncate">
                          {String((row as unknown[])[ci] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>← Другой файл</Button>
            <Button
              onClick={handleImport}
              disabled={detect.type === 'unknown'}
            >
              Импортировать {rawRows.length.toLocaleString('ru')} строк
            </Button>
            {detect.type === 'unknown' && (
              <span className="text-sm text-muted-foreground self-center">Формат не распознан — выберите тип вручную или свяжитесь с поддержкой</span>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 animate-pulse">⏳</div>
          <p className="text-lg font-medium">Импортируем данные…</p>
          <p className="text-sm text-muted-foreground mt-2">Проверяем дубликаты и записываем в базу</p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold">Импорт завершён</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Всего строк', value: result.total, color: '' },
              { label: 'Добавлено', value: result.inserted, color: 'text-green-600' },
              { label: 'Пропущено (дубли)', value: result.skipped, color: 'text-yellow-600' },
              { label: 'Ошибок', value: result.errors, color: 'text-red-500' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString('ru')}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button onClick={reset}>Импортировать ещё файл</Button>
          </div>
        </div>
      )}
    </div>
  )
}

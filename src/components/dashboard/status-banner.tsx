import Link from 'next/link'
import type { StocksAlerts, DataQualityAlerts } from '@/lib/queries-overview'

interface Props {
  stocks: StocksAlerts
  quality: DataQualityAlerts
  criticalTaskCount: number
  updatedAt: string
}

export function StatusBanner({ stocks, quality, criticalTaskCount, updatedAt }: Props) {
  const issues: { text: string; href: string }[] = []

  if (stocks.critical.length > 0)
    issues.push({ text: `${stocks.critical.length} SKU кончается на складе`, href: '/supplies' })
  if (stocks.soon.length > 0)
    issues.push({ text: `${stocks.soon.length} SKU < 21 дня`, href: '/supplies' })
  if (quality.missingCost > 0)
    issues.push({ text: `${quality.missingCost} товаров без себестоимости`, href: '/quality' })
  if (quality.missingToken)
    issues.push({ text: 'нет WB Analytics токена', href: '/settings' })
  if (criticalTaskCount > 0)
    issues.push({ text: `${criticalTaskCount} критичных задач`, href: '/tasks' })

  const level: 'ok' | 'warn' | 'critical' =
    stocks.critical.length > 0 || criticalTaskCount >= 3
      ? 'critical'
      : issues.length > 0
        ? 'warn'
        : 'ok'

  const s = {
    ok: {
      bar:  'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
      dot:  'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      msg:  'Всё в порядке',
    },
    warn: {
      bar:  'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
      dot:  'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      msg:  '',
    },
    critical: {
      bar:  'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
      dot:  'bg-red-500',
      text: 'text-red-700 dark:text-red-400',
      msg:  '',
    },
  }[level]

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${s.bar}`}>
      {/* Пульсирующий индикатор статуса */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {level !== 'ok' && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${s.dot}`} />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${s.dot}`} />
      </span>

      {level === 'ok' ? (
        <span className={`font-medium ${s.text}`}>{s.msg}</span>
      ) : (
        <span className={`flex flex-wrap gap-x-4 gap-y-0.5 ${s.text}`}>
          {issues.map((issue, i) => (
            <Link
              key={i}
              href={issue.href}
              className="font-medium hover:underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              {issue.text}
            </Link>
          ))}
        </span>
      )}

      <span className="ml-auto text-xs text-zinc-400 shrink-0 tabular-nums">{updatedAt}</span>
    </div>
  )
}

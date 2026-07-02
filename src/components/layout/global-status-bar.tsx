'use client'

import Link from 'next/link'

export type StatusTone = 'up' | 'warn' | 'down'

export interface GlobalStatusRisk {
  text: string
  href: string
}

interface GlobalStatusBarProps {
  tone: StatusTone
  headline: string
  metrics: { label: string; value: string }[]
  risks: GlobalStatusRisk[]
  updatedAt: string
}

const TONE_STYLES: Record<StatusTone, { dot: string; text: string }> = {
  up: { dot: 'var(--app-positive)', text: 'var(--app-positive)' },
  warn: { dot: 'var(--app-warn)', text: 'var(--app-warn)' },
  down: { dot: 'var(--app-risk)', text: 'var(--app-risk)' },
}

/** Sticky строка глобального статуса — видна во всех разделах (Ф1 редизайна Steep) */
export function GlobalStatusBar({ tone, headline, metrics, risks, updatedAt }: GlobalStatusBarProps) {
  const s = TONE_STYLES[tone]
  return (
    <div
      className="sticky top-0 z-20 flex items-center gap-5 px-5 py-3 backdrop-blur"
      style={{
        background: 'var(--app-status-bg)',
        borderBottom: '1px solid #ededef',
        fontFamily: 'var(--app-font-sans)',
      }}
    >
      <span className="flex items-center gap-2 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-60"
            style={{ background: s.dot, animation: tone !== 'up' ? 'app-status-pulse 2.4s infinite' : undefined }}
          />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: s.dot }} />
        </span>
        <span className="text-[14px] font-medium" style={{ color: s.text }}>{headline}</span>
      </span>

      <span className="flex items-center gap-4 text-[14px]" style={{ color: 'var(--app-ash)' }}>
        {metrics.map(m => (
          <span key={m.label} className="flex items-baseline gap-1.5">
            <span style={{ color: 'var(--app-graphite)' }}>{m.label}</span>
            <span className="font-medium" style={{ color: 'var(--app-text)' }}>{m.value}</span>
          </span>
        ))}
      </span>

      {risks.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[14px]">
          {risks.map((r, i) => (
            <Link
              key={i}
              href={r.href}
              className="font-medium hover:underline underline-offset-2"
              style={{ color: 'var(--app-rust)' }}
            >
              {r.text}
            </Link>
          ))}
        </span>
      )}

      <span className="ml-auto text-[13px] shrink-0 tabular-nums" style={{ color: 'var(--app-dove)' }}>
        {updatedAt}
      </span>

      <style>{`@keyframes app-status-pulse { 0%,100% { opacity: .6 } 50% { opacity: .15 } }`}</style>
    </div>
  )
}

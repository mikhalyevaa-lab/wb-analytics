import type { ReactNode } from 'react'

interface SectionShellProps {
  children: ReactNode
  /** Рейл вкладок между вложенными страницами раздела — задействуется при полной консолидации навигации (не в этой фазе) */
  railItems?: { label: string; href: string; active?: boolean }[]
  /** Максимальная ширина контента, px. По умолчанию 1400 — узкие страницы (напр. P&L) могут задать меньше */
  maxWidth?: number
}

/**
 * Контейнер раздела редизайна Steep: общий max-width/padding/типографика +
 * опциональный рейл вкладок. Sticky-статус теперь на уровне (app)/layout.tsx
 * (виден во всех разделах разом, см. GlobalStatusBarWidget) — Ф4.
 */
export function SectionShell({ children, railItems, maxWidth = 1400 }: SectionShellProps) {
  return (
    <div style={{ fontFamily: 'var(--app-font-sans)' }}>
      {railItems && railItems.length > 0 && (
        <div className="flex gap-1 px-5 pt-3" style={{ borderBottom: '1px solid #ededef' }}>
          {railItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-[14px] rounded-t-lg"
              style={{
                color: item.active ? 'var(--app-text)' : 'var(--app-graphite)',
                fontWeight: item.active ? 500 : 400,
                borderBottom: item.active ? '2px solid var(--app-rust)' : '2px solid transparent',
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
      <div className="p-6 space-y-5" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

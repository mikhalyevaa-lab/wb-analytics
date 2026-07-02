import type { ReactNode } from 'react'
import { Picto, type PictoName } from '@/components/ui/picto'

interface ChartCardProps {
  picto: PictoName
  title: string
  meta?: string
  variant?: 'default' | 'warm' | 'cool'
  span?: 1 | 2
  children: ReactNode
}

const VARIANT_BG: Record<NonNullable<ChartCardProps['variant']>, string> = {
  default: 'var(--app-white)',
  warm: 'var(--app-apricot-wash)',
  cool: 'var(--app-sky-wash)',
}

/** Общий рецепт карточки диаграммы: жетон-picto + заголовок (сериф) → график → легенда (Ф2 редизайна Steep) */
export function ChartCard({ picto, title, meta, variant = 'default', span = 1, children }: ChartCardProps) {
  return (
    <div
      className={span === 2 ? 'md:col-span-2' : undefined}
      style={{
        background: VARIANT_BG[variant],
        borderRadius: 'var(--app-radius-card)',
        boxShadow: variant === 'default' ? 'var(--app-shadow-card)' : 'rgba(4,23,43,.05) 0px 0px 0px 1px',
        padding: 24,
        fontFamily: 'var(--app-font-sans)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0"
            style={{
              background: variant === 'default' ? 'var(--app-fog)' : 'rgba(255,255,255,.5)',
              color: variant === 'warm' ? 'var(--app-rust)' : 'var(--app-text)',
            }}
          >
            <Picto name={picto} size={16} />
          </span>
          <span style={{ fontFamily: 'var(--app-font-serif)', fontSize: 17, color: 'var(--app-text)' }}>{title}</span>
        </span>
        {meta && <span className="text-[13px]" style={{ color: variant === 'warm' ? '#8a5a44' : 'var(--app-graphite)' }}>{meta}</span>}
      </div>
      {children}
    </div>
  )
}

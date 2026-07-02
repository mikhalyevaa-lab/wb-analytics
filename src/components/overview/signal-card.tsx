import Link from 'next/link'
import { Picto, type PictoName } from '@/components/ui/picto'

export type SignalTone = 'up' | 'warn' | 'down'

interface SignalCardProps {
  picto: PictoName
  label: string
  value: string
  sub: string
  tone: SignalTone
  href?: string
}

const TONE_STYLES: Record<SignalTone, { badgeBg: string; badgeColor: string }> = {
  up:   { badgeBg: 'var(--app-white)', badgeColor: 'var(--app-text)' },
  warn: { badgeBg: 'var(--app-apricot-wash)', badgeColor: 'var(--app-rust)' },
  down: { badgeBg: 'var(--app-apricot-wash)', badgeColor: 'var(--app-rust)' },
}

/** Карточка-сигнал строки-светофора (Продажи/Запасы/Реклама/Данные) — Ф2 редизайна Steep */
export function SignalCard({ picto, label, value, sub, tone, href }: SignalCardProps) {
  const s = TONE_STYLES[tone]
  const content = (
    <div
      className="p-5 h-full"
      style={{
        background: 'var(--app-white)',
        borderRadius: 'var(--app-radius-card)',
        boxShadow: 'var(--app-shadow-card)',
        fontFamily: 'var(--app-font-sans)',
      }}
    >
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-4"
        style={{ background: s.badgeBg, color: s.badgeColor, border: tone === 'up' ? '1.5px solid var(--app-text)' : 'none' }}
      >
        <Picto name={picto} size={16} />
      </span>
      <div className="text-[13px]" style={{ color: 'var(--app-graphite)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--app-font-serif)', fontSize: 22, color: tone === 'up' ? 'var(--app-text)' : 'var(--app-rust)', marginTop: 4 }}>
        {value}
      </div>
      <div className="text-[13px] mt-1" style={{ color: tone === 'up' ? 'var(--app-graphite)' : 'var(--app-rust)' }}>{sub}</div>
    </div>
  )
  if (href) return <Link href={href} className="block hover:opacity-90 transition-opacity">{content}</Link>
  return content
}

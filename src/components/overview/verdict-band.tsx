export type VerdictTone = 'up' | 'warn' | 'down'

interface VerdictBandProps {
  verdict: string
  value: string
  delta: string
  tone: VerdictTone
  note?: string
}

const TONE_COLOR: Record<VerdictTone, string> = {
  up: 'var(--app-positive)',
  warn: 'var(--app-warn)',
  down: 'var(--app-risk)',
}

/** Герой-плашка с вердиктом: словесная оценка + герой-цифра 34-52px + дельта (Ф2 редизайна Steep) */
export function VerdictBand({ verdict, value, delta, tone, note }: VerdictBandProps) {
  return (
    <div
      className="p-6 relative overflow-hidden"
      style={{
        background: 'var(--app-white)',
        borderRadius: 'var(--app-radius-card)',
        boxShadow: 'var(--app-shadow-card)',
      }}
    >
      <div
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--app-apricot-wash) 0%, transparent 70%)', opacity: .7 }}
      />
      <p className="relative text-[15px] leading-snug max-w-2xl" style={{ color: 'var(--app-ash)', fontFamily: 'var(--app-font-sans)' }}>
        {verdict}
      </p>
      <div className="relative flex items-baseline gap-3 mt-3">
        <span style={{ fontFamily: 'var(--app-font-serif)', fontSize: 44, lineHeight: 1.1, color: 'var(--app-text)' }}>
          {value}
        </span>
        <span className="text-[15px] font-medium" style={{ color: TONE_COLOR[tone] }}>
          {delta}
        </span>
      </div>
      {note && (
        <p className="relative text-[13px] mt-2" style={{ color: 'var(--app-graphite)' }}>{note}</p>
      )}
    </div>
  )
}

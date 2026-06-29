/**
 * Система пиктограмм WB Analytics.
 * Каждый раздел имеет уникальный SVG-символ — используется в навигации,
 * заголовках страниц и хлебных крошках.
 * Все иконки — монохромные, stroke-based, currentColor.
 */

export type PictoName =
  | 'overview'
  | 'dashboard'
  | 'catalog'
  | 'funnel'
  | 'advertising'
  | 'storage'
  | 'unit-economics'
  | 'abc'
  | 'rnp'
  | 'pnl'
  | 'costs'
  | 'cashflow'
  | 'logistics'
  | 'returns'
  | 'tasks'
  | 'supplies'
  | 'sales-plan'
  | 'import'
  | 'settings'
  | 'reports'
  | 'products'
  | 'quality'

interface PictoProps {
  name: PictoName
  size?: number
  className?: string
}

const icons: Record<PictoName, React.FC<{ s: number }>> = {
  overview: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="2.5" fill="currentColor"/>
      <line x1="9" y1="2.5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="5" x2="11.2" y2="6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  dashboard: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".2"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  catalog: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="2" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  funnel: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3.5h14L11.5 9v5.5l-5 1V9L2 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  advertising: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 5.5V9l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="9" r="1" fill="currentColor"/>
    </svg>
  ),
  storage: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 7.5L9 4l7 3.5V15.5H2V7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="6.5" y="10" width="5" height="5.5" rx="0.75" stroke="currentColor" strokeWidth="1.25"/>
      <line x1="9" y1="10" x2="9" y2="15.5" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  'unit-economics': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 7h2.5a1.5 1.5 0 010 3H7M7 10h3M7 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  abc: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="10" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7" y="6.5" width="4" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".15"/>
      <rect x="12" y="3" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  rnp: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="7.5" x2="16" y2="7.5" stroke="currentColor" strokeWidth="1.25"/>
      <line x1="7" y1="7.5" x2="7" y2="15" stroke="currentColor" strokeWidth="1"/>
      <line x1="11.5" y1="7.5" x2="11.5" y2="15" stroke="currentColor" strokeWidth="1"/>
      <rect x="5" y="3" width="1.5" height="0" />
      <line x1="5.5" y1="1.5" x2="5.5" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12.5" y1="1.5" x2="12.5" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  pnl: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".15"/>
      <rect x="7" y="7" width="4" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="12" y="5" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".15"/>
      <path d="M6 5l1 2" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" strokeLinecap="round"/>
      <path d="M11 9l1 2" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" strokeLinecap="round"/>
    </svg>
  ),
  costs: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 5v8M6.5 10.5L9 13l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  cashflow: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 5.5A6.5 6.5 0 115 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 9.5v3.5H1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  logistics: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11.5 8.5h3l2 4H11.5V8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="4.5" cy="13.5" r="1.25" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="13.5" cy="13.5" r="1.25" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  ),
  returns: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 2L16.5 15.5H1.5L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="9" y1="8" x2="9" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="13.5" r="0.9" fill="currentColor"/>
    </svg>
  ),
  tasks: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 9l2.5 2.5L12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  supplies: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="8" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 1.5v8M6.5 4L9 1.5 11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="3" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5"/>
    </svg>
  ),
  'sales-plan': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="9" cy="9" r="1" fill="currentColor"/>
      <line x1="9" y1="2.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="15.5" y1="9" x2="12.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  import: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 11.5V3M6 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 13.5v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  settings: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  reports: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="2" width="11" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="6" y="9.5" width="2" height="4.5" rx="0.5" fill="currentColor"/>
      <rect x="9.5" y="7" width="2" height="7" rx="0.5" fill="currentColor" fillOpacity=".6"/>
      <line x1="6" y1="5.5" x2="12" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  products: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1.5L16 5v8L9 16.5 2 13V5L9 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 1.5v15M2 5l7 3.5L16 5" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  ),
  quality: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1.5L10.8 6.3H16L11.6 9.2l1.8 4.8L9 11.1l-4.4 2.9 1.8-4.8L2 6.3h5.2L9 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
}

export function Picto({ name, size = 18, className }: PictoProps) {
  const Icon = icons[name]
  if (!Icon) return null
  return <span className={className} aria-hidden><Icon s={size} /></span>
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth-client'
import { useRole } from '@/contexts/role-context'

const nav = [
  { href: '/overview',       label: 'Обзор',                icon: '◎' },
  { href: '/dashboard',      label: 'Дашборд',              icon: '▦' },
  { href: '/catalog',        label: 'Справочник по товарам', icon: '☰' },
  { href: '/funnel',         label: 'Воронка',               icon: '◁' },
  { href: '/advertising',    label: 'Реклама',               icon: '◈' },
  { href: '/storage',        label: 'Хранение WB',           icon: '🏭' },
  { href: '/unit-economics', label: 'Юнитка',                icon: '💰', requiresPnl: true },
  { href: '/abc',            label: 'ABC-анализ',            icon: '◉' },
  { href: '/rnp',            label: 'РНП-Сводная',           icon: '⊞' },
  { href: '/pnl',            label: 'P&L',                   icon: '₽',  requiresPnl: true },
  { href: '/costs',          label: 'Затраты',               icon: '−',  requiresPnl: true },
  { href: '/cashflow',       label: 'Cash Flow',             icon: '⟳',  requiresPnl: true },
  { href: '/logistics',      label: 'Логистика',             icon: '⊡' },
  { href: '/returns',        label: 'Возвраты',              icon: '↩' },
  { href: '/tasks',          label: 'Задачи',                icon: '✓' },
  { href: '/supplies',       label: 'Поставки',              icon: '🚚' },
  { href: '/sales-plan',     label: 'План продаж',           icon: '◎' },
  { href: '/import',         label: 'Импорт данных',         icon: '↑' },
  { href: '/fin-reports',    label: 'Фин. отчёты',           icon: '📋', requiresPnl: true },
  { href: '/settings',       label: 'Настройки',             icon: '⚙' },
  { href: '/reports',        label: 'Отчёты WB',             icon: '📊', wip: true },
]

export function Sidebar({ storeName }: { storeName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { can, roleLabel, loading: roleLoading } = useRole()

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-zinc-900 dark:bg-zinc-950 text-white min-h-screen">
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold">
            WB
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none truncate">WB Analytics</p>
            {storeName && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{storeName}</p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map(item => {
          // Скрываем финансовые разделы для ролей без доступа к P&L
          if ('requiresPnl' in item && item.requiresPnl && !roleLoading && !can.viewPnl) return null
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="w-4 text-center text-base">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {'wip' in item && item.wip && (
                <span className="shrink-0 text-[9px] font-medium px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 leading-none">
                  WIP
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="px-2 py-3 border-t border-zinc-800 space-y-1">
        {/* Бейдж роли текущего пользователя */}
        {!roleLoading && roleLabel && (
          <div className="px-3 py-1.5 text-xs text-zinc-500 truncate">{roleLabel}</div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <span className="w-4 text-center">↩</span>
          Выйти
        </button>
      </div>
    </aside>
  )
}

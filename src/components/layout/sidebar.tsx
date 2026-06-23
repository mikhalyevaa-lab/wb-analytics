'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const nav = [
  { href: '/overview', label: 'Обзор', icon: '◎' },
  { href: '/dashboard', label: 'Дашборд', icon: '▦' },
  { href: '/pnl', label: 'P&L', icon: '₽' },
  { href: '/costs', label: 'Затраты', icon: '−' },
  { href: '/cashflow', label: 'Cash Flow', icon: '⟳' },
  { href: '/catalog', label: 'Справочник по товарам', icon: '☰' },
  { href: '/abc', label: 'ABC-анализ', icon: '◉' },
  { href: '/logistics', label: 'Логистика', icon: '⊡' },
  { href: '/reports', label: 'Отчёты WB', icon: '📊' },
  { href: '/funnel', label: 'Воронка', icon: '◁' },
  { href: '/tasks', label: 'Задачи', icon: '✓' },
  { href: '/advertising', label: 'Реклама', icon: '◈' },
  { href: '/rnp', label: 'РНП-Сводная', icon: '⊞' },
  { href: '/supplies', label: 'Поставки', icon: '🚚' },
  { href: '/sales-plan', label: 'План продаж', icon: '◎' },
  { href: '/storage', label: 'Хранение WB', icon: '🏭' },
  { href: '/quality', label: 'Качество данных', icon: '◑' },
  { href: '/import', label: 'Импорт данных', icon: '↑' },
  { href: '/settings', label: 'Настройки', icon: '⚙' },
]

export function Sidebar({ storeName }: { storeName?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
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
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-2 py-3 border-t border-zinc-800">
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

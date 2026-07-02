'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/auth-client'
import { useRole } from '@/contexts/role-context'
import { Picto, type PictoName } from '@/components/ui/picto'

interface NavItem {
  href: string
  label: string
  picto: PictoName
  requiresPnl?: boolean
}

const nav: NavItem[] = [
  { href: '/dashboard',      label: 'Главная',              picto: 'dashboard'      },
  { href: '/catalog',        label: 'Товары',               picto: 'catalog'        },
  { href: '/funnel',         label: 'Воронка',              picto: 'funnel'         },
  { href: '/advertising',    label: 'Реклама',              picto: 'advertising'    },
  { href: '/storage',        label: 'Хранение WB',          picto: 'storage'        },
  { href: '/unit-economics', label: 'Юнитка',               picto: 'unit-economics', requiresPnl: true },
  { href: '/abc',            label: 'ABC-анализ',           picto: 'abc'            },
  { href: '/rnp',            label: 'РНП-Сводная',          picto: 'rnp'            },
  { href: '/pnl',            label: 'P&L',                  picto: 'pnl',           requiresPnl: true },
  { href: '/costs',          label: 'Затраты',              picto: 'costs',         requiresPnl: true },
  { href: '/cashflow',       label: 'Cash Flow',            picto: 'cashflow',      requiresPnl: true },
  { href: '/logistics',      label: 'Логистика',            picto: 'logistics'      },
  { href: '/returns',        label: 'Возвраты',             picto: 'returns'        },
  { href: '/tasks',          label: 'Задачи',               picto: 'tasks'          },
  { href: '/supplies',       label: 'Поставки',             picto: 'supplies'       },
  { href: '/sales-plan',     label: 'План продаж',          picto: 'sales-plan'     },
  { href: '/import',         label: 'Импорт данных',        picto: 'import'         },
  { href: '/settings',       label: 'Настройки',            picto: 'settings'       },
  { href: '/reports',        label: 'Финансовые отчёты',    picto: 'reports',       requiresPnl: true },
]

export function Sidebar({ storeName }: { storeName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { can, roleLabel, loading: roleLoading } = useRole()
  // Ленивый инициализатор вместо useEffect — читаем класс .dark, который anti-FOUC
  // скрипт в layout.tsx уже применил к <html> до гидратации (см. app/layout.tsx)
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

  // React при гидратации перезаписывает className <html> (suppressHydrationWarning
  // глушит только предупреждение, не перезапись) — переприменяем класс сразу после маунта.
  // Без setState — только синхронизация с внешним DOM, лишена смысла лечить set-state-in-effect
  useEffect(() => {
    if (localStorage.getItem('wb-theme') === 'dark') {
      document.documentElement.classList.add('dark')
    }
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('wb-theme', next ? 'dark' : 'light')
  }

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col w-52 shrink-0 bg-zinc-900 dark:bg-zinc-950 text-white min-h-screen">
      {/* Логотип */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#818cf8" fillOpacity=".9"/>
              <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#818cf8" fillOpacity=".4"/>
              <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#818cf8" fillOpacity=".4"/>
              <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#818cf8" fillOpacity=".15"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none truncate">WB Analytics</p>
            {storeName && (
              <p className="text-xs text-zinc-500 mt-0.5 truncate">{storeName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {nav.map(item => {
          if (item.requiresPnl && !roleLoading && !can.viewPnl) return null
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-500/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {/* Иконка с акцентным цветом при активном состоянии */}
              <Picto
                name={item.picto}
                size={16}
                className={`flex-shrink-0 transition-colors ${
                  active ? 'text-indigo-400' : 'text-zinc-600'
                }`}
              />
              <span className={`flex-1 truncate ${active ? 'font-medium' : ''}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Нижняя панель: роль + выход */}
      <div className="px-2 py-3 border-t border-zinc-800 space-y-0.5">
        {!roleLoading && roleLabel && (
          <div className="px-2.5 py-1 text-xs text-zinc-600 truncate">{roleLabel}</div>
        )}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="flex-shrink-0"><circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="flex-shrink-0"><path d="M15.5 10.7A6.5 6.5 0 017.3 2.5a6.5 6.5 0 108.2 8.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          )}
          {isDark ? 'Светлая тема' : 'Тёмная тема'}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Picto name="import" size={16} className="flex-shrink-0 rotate-180" />
          Выйти
        </button>
      </div>
    </aside>
  )
}

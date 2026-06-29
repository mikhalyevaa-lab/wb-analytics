import { Picto, type PictoName } from '@/components/ui/picto'

interface PageHeaderProps {
  picto: PictoName
  title: string
  subtitle?: string
  children?: React.ReactNode   // слот для кнопок / фильтров справа
}

/**
 * Единый заголовок страницы — пиктограмма + h1 + subtitle + правый слот.
 * Использовать на каждой странице вместо кастомных заголовков.
 */
export function PageHeader({ picto, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Picto name={picto} size={18} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-wrap">
          {children}
        </div>
      )}
    </div>
  )
}

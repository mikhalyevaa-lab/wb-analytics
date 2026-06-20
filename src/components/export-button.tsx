'use client'

interface ExportButtonProps {
  href: string
  label?: string
}

export function ExportButton({ href, label = 'Экспорт Excel' }: ExportButtonProps) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
    >
      <span>↓</span>
      {label}
    </a>
  )
}

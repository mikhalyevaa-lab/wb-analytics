'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface HintProps {
  children: React.ReactNode
  size?: 'sm' | 'md'
  align?: 'left' | 'center' | 'right'
  width?: number // px, default 260
}

export function Hint({ children, size = 'sm', align = 'left', width = 260 }: HintProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, above: false })

  useEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const above = spaceBelow < 220

    let left = r.left
    if (align === 'right') left = r.right - width
    else if (align === 'center') left = r.left + r.width / 2 - width / 2

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))

    setPos({
      top: above ? r.top - 8 : r.bottom + 8,
      left,
      above,
    })
  }, [open, align, width])

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5 text-[10px]' : 'w-4 h-4 text-xs'

  const tooltip = open ? (
    <span
      className="fixed z-[9999] rounded-xl border bg-popover shadow-xl px-3 py-2.5 text-xs text-popover-foreground leading-relaxed pointer-events-none"
      style={{
        width,
        top: pos.top,
        left: pos.left,
        transform: pos.above ? 'translateY(-100%)' : 'none',
      }}
    >
      {children}
    </span>
  ) : null

  return (
    <span className="inline-flex items-center" style={{ verticalAlign: 'middle' }}>
      <button
        ref={ref}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`${iconSize} rounded-full border border-muted-foreground/40 text-muted-foreground/70 hover:border-foreground/60 hover:text-foreground flex items-center justify-center transition-colors focus:outline-none shrink-0`}
        aria-label="Подсказка"
      >
        i
      </button>
      {typeof document !== 'undefined' && tooltip
        ? createPortal(tooltip, document.body)
        : null}
    </span>
  )
}

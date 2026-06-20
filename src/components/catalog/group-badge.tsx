'use client'

interface GroupBadgeProps {
  name: string
  color: string
  className?: string
}

export function GroupBadge({ name, color, className = '' }: GroupBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  )
}

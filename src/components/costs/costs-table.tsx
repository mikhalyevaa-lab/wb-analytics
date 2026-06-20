'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ManualCost, CATEGORY_LABELS } from '@/lib/types'

const CATEGORY_COLORS: Record<string, string> = {
  salary: 'bg-blue-100 text-blue-700',
  rent: 'bg-purple-100 text-purple-700',
  tax: 'bg-orange-100 text-orange-700',
  loan: 'bg-red-100 text-red-700',
  other: 'bg-zinc-100 text-zinc-600',
}

function fmt(n: number) {
  return n.toLocaleString('ru') + ' ₽'
}

export function CostsTable({ items }: { items: ManualCost[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch('/api/costs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  if (!items.length) {
    return (
      <div className="text-center py-12 text-sm text-zinc-400">
        Затраты за этот период не добавлены
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Дата</TableHead>
          <TableHead>Категория</TableHead>
          <TableHead>Описание</TableHead>
          <TableHead className="text-right">Сумма</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(row => (
          <TableRow key={row.id}>
            <TableCell className="text-sm text-zinc-500">
              {new Date(row.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
            </TableCell>
            <TableCell>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[row.category]}`}>
                {CATEGORY_LABELS[row.category]}
              </span>
            </TableCell>
            <TableCell className="text-sm text-zinc-600 dark:text-zinc-300">
              {row.description || '—'}
            </TableCell>
            <TableCell className="text-right font-medium text-sm">
              {fmt(row.amount)}
            </TableCell>
            <TableCell>
              <button
                onClick={() => handleDelete(row.id)}
                disabled={deleting === row.id}
                className="text-zinc-300 hover:text-red-500 transition-colors text-xs"
                title="Удалить"
              >
                {deleting === row.id ? '...' : '×'}
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

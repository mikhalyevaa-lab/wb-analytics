'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CostInputProps {
  storeId: string
  nmId: number
  initialValue: number
}

export function CostInput({ storeId, nmId, initialValue }: CostInputProps) {
  const router = useRouter()
  const [value, setValue] = useState(String(initialValue || ''))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      await fetch('/api/products/cost', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, nm_id: nmId, cost_price: Number(value) }),
      })
      setDirty(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={e => { setValue(e.target.value); setDirty(true) }}
        onBlur={save}
        onKeyDown={e => e.key === 'Enter' && save()}
        className="w-24 h-7 px-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-zinc-400 tabular-nums"
        placeholder="0"
      />
      <span className="text-xs text-zinc-400">₽</span>
      {saving && <span className="text-xs text-zinc-400">...</span>}
    </div>
  )
}

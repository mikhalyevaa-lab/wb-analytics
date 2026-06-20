'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ALL_COLUMNS, DEFAULT_COLUMNS, type ColumnKey } from './catalog-table'

interface Props {
  visible: ColumnKey[]
  onChange: (cols: ColumnKey[]) => void
  onClose: () => void
}

export function ColumnsModal({ visible, onChange, onClose }: Props) {
  const [selected, setSelected] = useState<Set<ColumnKey>>(new Set(visible))

  const toggle = (key: ColumnKey) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = () => {
    // Preserve order from ALL_COLUMNS
    const ordered = ALL_COLUMNS.filter(c => selected.has(c.key)).map(c => c.key)
    onChange(ordered)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Настройка колонок</h2>
        <div className="space-y-2 mb-4">
          {ALL_COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(col.key)}
                onChange={() => toggle(col.key)}
                className="rounded"
              />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(DEFAULT_COLUMNS))}>
            По умолчанию
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={handleSave}>Сохранить</Button>
        </div>
      </div>
    </div>
  )
}

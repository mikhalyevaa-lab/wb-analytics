'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GroupBadge } from './group-badge'
import { type ProductGroup } from './catalog-table'

const PRESET_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#f97316', '#14b8a6']

interface Props {
  groups: ProductGroup[]
  storeId: string
  onClose: () => void
  onChange: (groups: ProductGroup[]) => void
}

export function GroupsManagerModal({ groups: initialGroups, storeId, onClose, onChange }: Props) {
  const [groups, setGroups] = useState(initialGroups)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const create = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor, store_id: storeId }),
    })
    if (res.ok) {
      const g = await res.json()
      const updated = [...groups, g]
      setGroups(updated)
      onChange(updated)
      setNewName('')
    }
  }

  const startEdit = (g: ProductGroup) => {
    setEditId(g.id)
    setEditName(g.name)
    setEditColor(g.color)
  }

  const saveEdit = async () => {
    if (!editId) return
    const res = await fetch(`/api/groups/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    })
    if (res.ok) {
      const updated = groups.map(g => g.id === editId ? { ...g, name: editName.trim(), color: editColor } : g)
      setGroups(updated)
      onChange(updated)
      setEditId(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Удалить группу? Привязки товаров будут сброшены.')) return
    const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = groups.filter(g => g.id !== id)
      setGroups(updated)
      onChange(updated)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Управление группами</h2>

        {/* Existing groups */}
        <div className="space-y-2 mb-4">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">Нет групп</p>}
          {groups.map(g => (
            <div key={g.id} className="flex items-center gap-2">
              {editId === g.id ? (
                <>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 flex-1" />
                  <div className="flex gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        className={`w-4 h-4 rounded-full border-2 ${editColor === c ? 'border-foreground' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <Button size="sm" className="h-7" onClick={saveEdit}>✓</Button>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditId(null)}>✕</Button>
                </>
              ) : (
                <>
                  <GroupBadge name={g.name} color={g.color} />
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(g)}>✎</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => remove(g.id)}>✕</Button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new group */}
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium">Новая группа</p>
          <Input
            placeholder="Название"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            className="h-8"
          />
          <div className="flex gap-2 items-center">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`w-5 h-5 rounded-full border-2 ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <Button size="sm" onClick={create} disabled={!newName.trim()}>Добавить</Button>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}

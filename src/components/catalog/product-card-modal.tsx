'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GroupBadge } from './group-badge'
import { type CatalogProduct, type ProductGroup } from './catalog-table'
import { useRole } from '@/contexts/role-context'

interface Props {
  product: CatalogProduct
  groups: ProductGroup[]
  onClose: () => void
  onUpdate: (p: CatalogProduct) => void
}

function fmt(n: number | null, decimals = 0, suffix = '') {
  if (n == null) return '—'
  return n.toLocaleString('ru', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix
}

export function ProductCardModal({ product, groups, onClose, onUpdate }: Props) {
  const { can } = useRole()
  const [costPrice, setCostPrice] = useState(product.cost_price?.toString() ?? '')
  const [groupId, setGroupId] = useState(product.group_id ?? '__none__')
  const [saving, setSaving] = useState(false)
  const [sizes, setSizes] = useState<{ size: string; qty: number }[] | null>(null)

  useEffect(() => {
    fetch(`/api/catalog/${product.nm_id}/stocks`)
      .then(r => r.json())
      .then(setSizes)
      .catch(() => setSizes([]))
  }, [product.nm_id])

  const hasChanges = costPrice !== (product.cost_price?.toString() ?? '') ||
    groupId !== (product.group_id ?? '__none__')

  const save = async () => {
    setSaving(true)
    const body: Record<string, unknown> = {}
    if (costPrice !== (product.cost_price?.toString() ?? '')) {
      body.cost_price = costPrice ? parseFloat(costPrice) : null
    }
    if (groupId !== (product.group_id ?? '__none__')) {
      body.group_id = groupId === '__none__' ? null : groupId
    }

    const res = await fetch(`/api/catalog/${product.nm_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      const newGroup = groups.find(g => g.id === updated.group_id) ?? null
      onUpdate({
        ...product,
        ...updated,
        product_groups: newGroup ? { id: newGroup.id, name: newGroup.name, color: newGroup.color } : null,
      })
    }
    setSaving(false)
  }

  const wbUrl = `https://www.wildberries.ru/catalog/${product.nm_id}/detail.aspx`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg p-6 w-[500px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex gap-4 mb-4">
          {product.photo_url
            ? <img src={product.photo_url} alt="" className="h-32 w-24 object-cover rounded flex-none" />
            : <div className="h-32 w-24 bg-muted rounded flex-none" />
          }
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base leading-tight mb-1">{product.title ?? product.vendor_code}</h2>
            <p className="text-sm text-muted-foreground mb-1">{product.subject_name}</p>
            {product.product_groups && (
              <GroupBadge name={product.product_groups.name} color={product.product_groups.color} className="mb-2" />
            )}
            <a
              href={wbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              Открыть на Wildberries ↗
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
          <Row label="Артикул WB" value={product.nm_id} />
          <Row label="Арт. поставщика" value={product.vendor_code} />
          <Row label="Бренд" value={product.brand} />
          <Row label="Цвет" value={product.color} />
          <Row label="% выкупа (30д)" value={fmt(product.buyout_rate, 1, '%')} />
          <Row label="Заказов/день (7д)" value={fmt(product.avg_orders_per_day, 1)} />
          <Row label="Цена до СПП (7д)" value={fmt(product.avg_price_before_spp, 0, ' ₽')} />
          <Row label="Цена после СПП (7д)" value={fmt(product.avg_price_after_spp, 0, ' ₽')} />
          <Row label="Остаток" value={fmt(product.current_stock)} />
          <Row
            label="Себест. остатков"
            value={product.current_stock && product.cost_price
              ? fmt(product.current_stock * product.cost_price, 0) + ' ₽'
              : '—'}
          />
          <Row
            label="Стоим. остатков (до СПП)"
            value={product.current_stock && product.avg_price_before_spp
              ? fmt(product.current_stock * product.avg_price_before_spp, 0) + ' ₽'
              : '—'}
          />
        </div>

        {/* Остатки по размерам */}
        {sizes === null ? (
          <p className="text-xs text-muted-foreground py-2">Загружаю остатки по размерам…</p>
        ) : sizes.length > 1 ? (
          <div className="border rounded-md overflow-hidden mb-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">Размер</th>
                  <th className="text-right px-3 py-1.5 text-xs font-medium text-muted-foreground">Остаток, шт</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map(s => (
                  <tr key={s.size} className="border-t">
                    <td className="px-3 py-1.5">{s.size}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="space-y-3 border-t pt-3">
          {can.editCostPrice && (
            <div>
              <label className="text-xs text-muted-foreground">Себестоимость, ₽</label>
              <Input
                type="number"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value)}
                placeholder="0"
                className="h-8 mt-1"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Группа</label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="h-8 mt-1">
                <SelectValue placeholder="Без группы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без группы</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                      {g.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Закрыть</Button>
          <div className="flex-1" />
          {hasChanges && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{value != null && value !== '' ? String(value) : '—'}</span>
    </>
  )
}

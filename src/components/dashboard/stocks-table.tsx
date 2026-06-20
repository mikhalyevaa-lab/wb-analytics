import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { StockItem } from '@/lib/queries'

function StockBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <Badge variant="secondary">нет продаж</Badge>
  }
  if (days <= 7) {
    return <Badge className="bg-red-500 hover:bg-red-500 text-white">{days} дн.</Badge>
  }
  if (days <= 21) {
    return <Badge className="bg-amber-400 hover:bg-amber-400 text-zinc-900">{days} дн.</Badge>
  }
  return <Badge variant="secondary">{days} дн.</Badge>
}

export function StocksTable({ items }: { items: StockItem[] }) {
  if (!items.length) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center justify-center h-32 text-zinc-400 text-sm">
          Остатки пока не загружены
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Остатки по SKU
          </p>
          <p className="text-xs text-zinc-400">{items.length} позиций</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Артикул</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Бренд</TableHead>
              <TableHead className="text-right">Остаток</TableHead>
              <TableHead className="text-right">Дней</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 20).map(item => (
              <TableRow key={item.nm_id}>
                <TableCell className="font-mono text-xs">{item.supplier_article}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{item.subject}</TableCell>
                <TableCell className="text-sm text-zinc-500">{item.brand}</TableCell>
                <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                <TableCell className="text-right">
                  <StockBadge days={item.days_left} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

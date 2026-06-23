export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { SkuMatrix } from '@/components/matrix/sku-matrix'

export default async function SkuMatrixPage({
  params,
}: {
  params: Promise<{ nm_id: string }>
}) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')

  const { nm_id } = await params
  const nmId = parseInt(nm_id)
  if (isNaN(nmId)) redirect('/catalog')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <a href="/catalog" className="text-muted-foreground hover:text-white text-sm">← Справочник</a>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">дк-матрица #{nmId}</span>
      </div>
      <SkuMatrix nmId={nmId} />
    </div>
  )
}

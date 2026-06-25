import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'

export const dynamic = 'force-dynamic'

// Возвращает роль текущего пользователя в магазине
export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ role: null })

  const rows = await db<{ role: string }[]>`
    SELECT role FROM user_stores WHERE user_id = ${user.id} AND store_id = ${storeIds[0]} LIMIT 1
  `

  return NextResponse.json({ role: rows[0]?.role ?? null })
}

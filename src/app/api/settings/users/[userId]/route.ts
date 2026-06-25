import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { requireRole, CAN_MANAGE_USERS, ROLES, type Role } from '@/lib/auth-roles'

export const dynamic = 'force-dynamic'

// PATCH — сменить роль пользователя
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  try { await requireRole(user.id, storeId, CAN_MANAGE_USERS) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const { userId } = await params
  const { role } = await req.json() as { role: Role }

  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Некорректная роль' }, { status: 400 })
  }

  // Нельзя сменить роль последнего owner
  if (role !== 'owner') {
    const owners = await db`
      SELECT user_id FROM user_stores WHERE store_id = ${storeId} AND role = 'owner'
    `
    const isLastOwner = owners.length === 1 && owners[0].user_id === userId
    if (isLastOwner) {
      return NextResponse.json({ error: 'Нельзя понизить последнего владельца' }, { status: 400 })
    }
  }

  await db`
    UPDATE user_stores SET role = ${role}
    WHERE user_id = ${userId} AND store_id = ${storeId}
  `

  return NextResponse.json({ ok: true })
}

// DELETE — удалить пользователя из магазина
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  try { await requireRole(user.id, storeId, CAN_MANAGE_USERS) }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const { userId } = await params

  // Нельзя удалить последнего owner
  const owners = await db`
    SELECT user_id FROM user_stores WHERE store_id = ${storeId} AND role = 'owner'
  `
  const isLastOwner = owners.length === 1 && owners[0].user_id === userId
  if (isLastOwner) {
    return NextResponse.json({ error: 'Нельзя удалить последнего владельца' }, { status: 400 })
  }

  await db`DELETE FROM user_stores WHERE user_id = ${userId} AND store_id = ${storeId}`

  return NextResponse.json({ ok: true })
}

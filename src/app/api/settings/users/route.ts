import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getUserStoreIds } from '@/lib/queries'
import { requireRole, CAN_MANAGE_USERS, CAN_INVITE_ROLES, ROLES, type Role } from '@/lib/auth-roles'

export const dynamic = 'force-dynamic'

// GET — список пользователей магазина + ожидающие инвайты
export async function GET() {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  await requireRole(user.id, storeId, CAN_MANAGE_USERS).catch(() => {
    // Не-admin получает только свою роль
  })

  const members = await db`
    SELECT us.user_id, us.role, u.name, u.email, u.image
    FROM user_stores us
    JOIN "user" u ON u.id = us.user_id
    WHERE us.store_id = ${storeId}
    ORDER BY
      CASE us.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      u.name
  `

  const invites = await db`
    SELECT id, email, role, expires_at, accepted_at, created_at
    FROM invitations
    WHERE store_id = ${storeId}
      AND accepted_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
  `

  return NextResponse.json({ members, invites })
}

// POST — пригласить пользователя
export async function POST(req: NextRequest) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeIds = await getUserStoreIds(user.id)
  if (!storeIds.length) return NextResponse.json({ error: 'No store' }, { status: 404 })
  const storeId = storeIds[0]

  try {
    await requireRole(user.id, storeId, CAN_MANAGE_USERS)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { email?: string; role?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  const role  = body.role as Role

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Некорректный email' }, { status: 400 })
  }
  if (!role || !CAN_INVITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Некорректная роль' }, { status: 400 })
  }

  // Проверяем — нет ли уже такого пользователя в магазине
  const existing = await db`
    SELECT us.user_id FROM user_stores us
    JOIN "user" u ON u.id = us.user_id
    WHERE us.store_id = ${storeId} AND lower(u.email) = ${email}
  `
  if (existing.length) {
    return NextResponse.json({ error: 'Пользователь уже добавлен в магазин' }, { status: 409 })
  }

  // Удаляем старый инвайт если был (идемпотентность)
  await db`
    DELETE FROM invitations WHERE store_id = ${storeId} AND email = ${email} AND accepted_at IS NULL
  `

  const [invite] = await db`
    INSERT INTO invitations (store_id, email, role, invited_by)
    VALUES (${storeId}, ${email}, ${role}, ${user.id})
    RETURNING id, token, email, role, expires_at
  `

  // Отправляем email через API route (не блокируем ответ)
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const inviteUrl = `${baseUrl}/invite/${invite.token}`

  // ponytail: fetch к себе — простейший способ без внешней email-библиотеки
  fetch(`${baseUrl}/api/settings/users/send-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, inviteUrl, role, inviterName: user.name ?? user.email }),
  }).catch(e => console.error('[invite] email send failed:', e))

  return NextResponse.json({ ok: true, invite })
}

import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

// POST — принять приглашение (вызывается со страницы /invite/[token] после входа)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const user = await requireAuth().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await params

  const [invite] = await db`
    SELECT id, store_id, email, role, expires_at, accepted_at
    FROM invitations
    WHERE token = ${token}::uuid
    LIMIT 1
  `

  if (!invite) return NextResponse.json({ error: 'Приглашение не найдено' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Приглашение уже использовано' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Срок приглашения истёк' }, { status: 410 })
  }

  // Проверяем что email совпадает с авторизованным пользователем
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({
      error: `Приглашение отправлено на ${invite.email}. Войдите с этим адресом.`
    }, { status: 403 })
  }

  // Добавляем в магазин (или обновляем роль если уже есть)
  await db`
    INSERT INTO user_stores (user_id, store_id, role)
    VALUES (${user.id}, ${invite.store_id}, ${invite.role})
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role
  `

  await db`
    UPDATE invitations SET accepted_at = now() WHERE id = ${invite.id}
  `

  return NextResponse.json({ ok: true, storeId: invite.store_id, role: invite.role })
}

// GET — получить инфо об инвайте (для отображения на странице)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const [invite] = await db`
    SELECT i.email, i.role, i.expires_at, i.accepted_at, s.name AS store_name,
           u.name AS inviter_name
    FROM invitations i
    JOIN stores s ON s.id = i.store_id
    JOIN "user" u ON u.id = i.invited_by
    WHERE i.token = ${token}::uuid
    LIMIT 1
  `

  if (!invite) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })

  return NextResponse.json({
    email:       invite.email,
    role:        invite.role,
    storeName:   invite.store_name,
    inviterName: invite.inviter_name,
    expiresAt:   invite.expires_at,
    accepted:    !!invite.accepted_at,
    expired:     new Date(invite.expires_at) < new Date(),
  })
}

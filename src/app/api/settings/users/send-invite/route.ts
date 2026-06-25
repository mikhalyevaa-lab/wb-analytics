import { NextRequest, NextResponse } from 'next/server'
import { ROLE_LABELS, type Role } from '@/lib/auth-roles'

export const dynamic = 'force-dynamic'

// ponytail: простая отправка через SMTP если настроен, иначе логируем ссылку в консоль
export async function POST(req: NextRequest) {
  const { to, inviteUrl, role, inviterName } = await req.json() as {
    to: string; inviteUrl: string; role: Role; inviterName: string
  }

  const roleLabel = ROLE_LABELS[role] ?? role
  const subject   = `Вас пригласили в WB Analytics`
  const text      = `
${inviterName} приглашает вас в WB Analytics в роли «${roleLabel}».

Перейдите по ссылке, чтобы принять приглашение:
${inviteUrl}

Ссылка действительна 7 дней.
`.trim()

  // Если SMTP не настроен — выводим в консоль (удобно на dev)
  const smtpHost = process.env.SMTP_HOST
  if (!smtpHost) {
    console.log(`[invite] ⚠️ SMTP не настроен. Ссылка для ${to}:`)
    console.log(`[invite] ${inviteUrl}`)
    return NextResponse.json({ ok: true, method: 'console' })
  }

  try {
    // ponytail: require без типов — nodemailer опционален, устанавливается при наличии SMTP
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const nodemailer = require('nodemailer') as any
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? `WB Analytics <noreply@${process.env.SMTP_HOST}>`,
      to,
      subject,
      text,
    })
    return NextResponse.json({ ok: true, method: 'smtp' })
  } catch (e) {
    console.error('[invite] email error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

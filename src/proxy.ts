import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron', '/api/sync', '/_next', '/favicon.ico']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  // Проверяем наличие сессионной куки (быстрая проверка без DB)
  const sessionCookie = req.cookies.get('better-auth.session_token')
  if (!sessionCookie?.value) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

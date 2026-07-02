import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { adminDb } from '@/lib/db-compat'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth()
    const adb = adminDb()

    const { data, error } = await adb
      .from('wb_tariffs_uploads')
      .select('effective_date, filename, rows_count, uploaded_at')
      .order('effective_date', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    return NextResponse.json({ uploads: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

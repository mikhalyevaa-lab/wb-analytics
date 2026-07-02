import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sqls = [
    `ALTER TABLE wb_storage_daily ADD COLUMN IF NOT EXISTS barcodes_count integer`,
    `ALTER TABLE wb_storage_daily ADD COLUMN IF NOT EXISTS cost_per_unit numeric(12,6)`,
  ]

  const results: { sql: string; ok: boolean; error?: string }[] = []
  for (const sql of sqls) {
    try {
      await db.unsafe(sql)
      results.push({ sql, ok: true })
    } catch (err) {
      results.push({ sql, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ results })
}

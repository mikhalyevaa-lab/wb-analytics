import { createClient } from '@supabase/supabase-js'

let _adminDb: ReturnType<typeof createClient> | null = null

export function adminDb() {
  if (!_adminDb) {
    _adminDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _adminDb
}

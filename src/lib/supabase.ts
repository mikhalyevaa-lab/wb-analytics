// Legacy shim: browser client — used only in login flow (replaced by better-auth)
export function createClient() {
  throw new Error('Use @/lib/auth-client instead of supabase createClient on the client side')
}

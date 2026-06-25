import { auth } from './auth'
import { headers } from 'next/headers'

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireAuth() {
  const session = await getServerSession()
  if (!session?.user) throw new Error('Unauthorized')
  return session.user
}

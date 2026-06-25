import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const authPool = new Pool({ connectionString: process.env.DATABASE_URL })

export const auth = betterAuth({
  database: authPool,
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
})

export type Session = typeof auth.$Infer.Session
export type User    = typeof auth.$Infer.Session.user

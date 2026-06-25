// Создаёт первого пользователя через better-auth API
// Использование: node scripts/create-user.mjs <email> <password> <name>

const [,, email, password, name] = process.argv

if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> <password> [name]')
  process.exit(1)
}

const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'

const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name: name ?? email }),
})

const body = await res.json()

if (!res.ok) {
  console.error('❌ Ошибка:', res.status, JSON.stringify(body, null, 2))
  process.exit(1)
}

console.log('✅ Пользователь создан:', body.user?.email ?? body)

// scripts/migrate.js — запускает schema_local.sql как единственную "миграцию"
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const postgres = require('postgres')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sql = postgres(process.env.DATABASE_URL, { max: 1 })

async function migrate() {
  console.log('▶  Applying schema...')

  const schemaPath = path.join(__dirname, '../supabase/schema_local.sql')
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8')

  await sql.unsafe(schemaContent)
  console.log('✅ Schema applied')

  await sql.end()
  console.log('🎉 Migration complete')
}

migrate().catch(err => {
  console.error('❌ Migration error:', err)
  process.exit(1)
})

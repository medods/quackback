import { config } from 'dotenv'
config({ path: '../../.env', quiet: true })

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigrations() {
  const rawConnectionString = process.env.DATABASE_URL

  if (!rawConnectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  // dotenv does not expand ${VAR} references by default.
  // Expand placeholders in DATABASE_URL so values like
  // postgresql://...:${POSTGRES_PORT}/... work in migration scripts.
  const connectionString = rawConnectionString.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, key) => {
    const value = process.env[key]
    if (!value) {
      throw new Error(`DATABASE_URL references missing environment variable: ${key}`)
    }
    return value
  })

  // Allow overriding migrations folder via env var (for Docker)
  // Default to ./drizzle relative to this script
  const migrationsFolder = process.env.MIGRATIONS_FOLDER || path.resolve(__dirname, '../drizzle')

  console.log('🔄 Running migrations...')
  console.log(`   Migrations folder: ${migrationsFolder}`)

  // Use a single connection for migrations
  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  try {
    // Ensure pgvector extension is available before running migrations
    await sql`CREATE EXTENSION IF NOT EXISTS vector`
    await migrate(db, { migrationsFolder })
    console.log('✅ Migrations completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

runMigrations()

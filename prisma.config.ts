import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config as dotenvConfig } from 'dotenv'

// Charge .env.local en priorite (convention Next.js), puis .env en fallback.
dotenvConfig({ path: '.env.local' })
dotenvConfig()

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})

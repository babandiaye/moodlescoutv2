import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const result: {
    ok: boolean
    version: string
    db?: { ok: boolean; latencyMs?: number; error?: string }
    redis?: { ok: boolean; latencyMs?: number; error?: string }
  } = {
    ok: true,
    version: '2.0.0',
  }

  // Postgres
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    result.db = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (err) {
    result.ok = false
    result.db = { ok: false, error: (err as Error).message }
  }

  // Redis
  if (redis) {
    const redisStart = Date.now()
    try {
      await redis.ping()
      result.redis = { ok: true, latencyMs: Date.now() - redisStart }
    } catch (err) {
      result.ok = false
      result.redis = { ok: false, error: (err as Error).message }
    }
  } else {
    result.redis = { ok: false, error: 'REDIS_URL non configuree' }
    result.ok = false
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}

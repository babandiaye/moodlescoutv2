import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { redis } from '@/lib/redis'
import { requireAuth } from '@/lib/api-helpers'
import { getSiteInfo, getUsersTotalCount } from '@/lib/moodle'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const CACHE_TTL_SEC = 600 // 10 min

type Stats = {
  url: string
  sitename: string | null
  release: string | null
  version: string | null
  nbUsers: number | null
  computedAt: string
  durationMs: number
  cached: boolean
}

async function readCache(id: string): Promise<Stats | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(`moodle:stats:${id}`)
    if (!raw) return null
    return { ...JSON.parse(raw), cached: true }
  } catch {
    return null
  }
}

async function writeCache(id: string, stats: Stats): Promise<void> {
  if (!redis) return
  try {
    await redis.set(`moodle:stats:${id}`, JSON.stringify(stats), 'EX', CACHE_TTL_SEC)
  } catch {
    // ignore
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const url = new URL(req.url)
  const refresh = url.searchParams.get('refresh') === '1'

  const platform = await prisma.moodlePlatform.findUnique({ where: { id } })
  if (!platform) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  if (!refresh) {
    const cached = await readCache(id)
    if (cached) return NextResponse.json(cached)
  }

  const start = Date.now()
  try {
    const token = decrypt(platform.tokenEnc)

    // 2 appels parallèles légers : infos site + comptage users.
    const [siteInfo, nbUsers] = await Promise.all([
      getSiteInfo(platform.url, token).catch(() => null),
      getUsersTotalCount(platform.url, token),
    ])

    const stats: Stats = {
      url: platform.url,
      sitename: siteInfo?.sitename ?? null,
      release: siteInfo?.release ?? null,
      version: siteInfo?.version ?? null,
      nbUsers,
      computedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      cached: false,
    }
    await writeCache(id, stats)
    return NextResponse.json(stats)
  } catch (err) {
    const message = (err as Error).message
    logger.warn({ id, err: message }, 'Stats plateforme échouées')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

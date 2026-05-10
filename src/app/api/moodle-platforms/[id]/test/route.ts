import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { getSiteInfo } from '@/lib/moodle'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const platform = await prisma.moodlePlatform.findUnique({ where: { id } })
  if (!platform) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const start = Date.now()
  try {
    const token = decrypt(platform.tokenEnc)
    const info = await getSiteInfo(platform.url, token)
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      sitename: info.sitename ?? '',
      username: info.username ?? '',
      release: info.release ?? '',
      version: info.version ?? '',
    })
  } catch (err) {
    const message = (err as Error).message
    logger.warn({ id, err: message }, 'Test plateforme Moodle: échec')
    return NextResponse.json(
      { ok: false, latencyMs: Date.now() - start, error: message },
      { status: 200 },
    )
  }
}

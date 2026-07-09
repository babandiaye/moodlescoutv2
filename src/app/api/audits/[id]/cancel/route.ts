import { NextRequest, NextResponse } from 'next/server'
import IORedis from 'ioredis'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { checkAuditAccess } from '@/lib/audit-access'
import { SSE_CHANNEL } from '@/lib/queue'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const access = await checkAuditAccess(id, a.user, true)
  if (!access.ok) return access.response
  if (['completed', 'failed', 'cancelled'].includes(access.audit.status)) {
    return NextResponse.json(
      { error: `Audit déjà ${access.audit.status}` },
      { status: 409 },
    )
  }

  // Marque la session annulée. Le worker, qui poll status à chaque cours,
  // sortira proprement à la prochaine itération en préservant les résultats déjà traités.
  await prisma.auditSession.update({
    where: { id },
    data: { status: 'cancelled' },
  })

  // Notifie immédiatement les clients SSE.
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const pub = new IORedis(redisUrl, { maxRetriesPerRequest: null })
    try {
      await pub.publish(
        SSE_CHANNEL(id),
        JSON.stringify({ type: 'status', status: 'cancelled' }),
      )
    } catch (err) {
      logger.warn({ err: (err as Error).message, id }, 'Cancel: publish SSE échoué')
    } finally {
      pub.disconnect()
    }
  }

  logger.info({ sessionId: id, by: a.user.id }, 'Audit annulé')
  return NextResponse.json({ ok: true })
}

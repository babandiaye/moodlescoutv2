import { NextRequest, NextResponse } from 'next/server'
import IORedis from 'ioredis'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { SSE_CHANNEL } from '@/lib/queue'
import { logger } from '@/lib/logger'
import { canModifyAudit } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const session = await prisma.auditSession.findUnique({
    where: { id },
    select: { userId: true, status: true },
  })
  if (!session) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  // Annulation : strictement admin OU propriétaire — le lecteur NE PEUT PAS annuler.
  if (!canModifyAudit(a.user.role, a.user.id, session.userId)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  if (['completed', 'failed', 'cancelled'].includes(session.status)) {
    return NextResponse.json(
      { error: `Audit déjà ${session.status}` },
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

import { NextRequest } from 'next/server'
import IORedis from 'ioredis'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { checkAuditAccess } from '@/lib/audit-access'
import { SSE_CHANNEL } from '@/lib/queue'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const access = await checkAuditAccess(id, a.user)
  if (!access.ok) return access.response

  const session = await prisma.auditSession.findUnique({
    where: { id },
    select: { status: true, doneCourses: true, failedCourses: true, totalCourses: true },
  })
  if (!session) return new Response('Audit introuvable', { status: 404 })

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) return new Response('REDIS_URL manquant', { status: 503 })

  const subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null })
  const encoder = new TextEncoder()
  const channel = SSE_CHANNEL(id)

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller closed
        }
      }

      // Snapshot initial
      send('snapshot', {
        status: session.status,
        done: session.doneCourses,
        failed: session.failedCourses,
        total: session.totalCourses,
      })

      // Si déjà terminé, pas besoin de subscribe
      if (['completed', 'failed', 'cancelled'].includes(session.status)) {
        send('end', { status: session.status })
        controller.close()
        subscriber.disconnect()
        return
      }

      subscriber.subscribe(channel).catch(err => {
        logger.warn({ err: (err as Error).message, channel }, 'SSE subscribe failed')
      })

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 25000)

      subscriber.on('message', (_chan, msg) => {
        try {
          const evt = JSON.parse(msg)
          send(evt.type ?? 'message', evt)
          if (evt.type === 'status' && ['completed', 'failed', 'cancelled'].includes(evt.status)) {
            clearInterval(heartbeat)
            send('end', { status: evt.status })
            controller.close()
            subscriber.disconnect()
          }
        } catch {
          // ignore malformed
        }
      })

      subscriber.on('error', err => {
        logger.warn({ err: err.message }, 'SSE redis error')
      })
    },
    cancel() {
      subscriber.disconnect()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

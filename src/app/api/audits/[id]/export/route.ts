import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { exportToExcel, exportToPdf } from '@/lib/exports'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'excel').toLowerCase()
  if (format !== 'excel' && format !== 'pdf') {
    return new Response('Format invalide (excel|pdf)', { status: 400 })
  }

  const session = await prisma.auditSession.findUnique({
    where: { id },
    select: {
      userId: true,
      sessionKey: true,
      courseAudits: {
        where: { errorMessage: null },
        orderBy: { createdAt: 'asc' },
        select: { resultJson: true },
      },
    },
  })
  if (!session) return new Response('Introuvable', { status: 404 })
  if (a.user.role !== 'admin' && session.userId !== a.user.id) {
    return new Response('Accès refusé', { status: 403 })
  }

  const courses = session.courseAudits
    .map((c: { resultJson: unknown }) => c.resultJson)
    .filter((c: unknown): c is Record<string, any> => c !== null && typeof c === 'object')

  if (courses.length === 0) {
    return new Response('Aucun résultat à exporter', { status: 404 })
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  try {
    if (format === 'excel') {
      const buf = await exportToExcel(courses)
      return new Response(buf as any, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="moodlescout_${ts}.xlsx"`,
          'Content-Length': String(buf.length),
        },
      })
    }
    const buf = await exportToPdf(courses)
    return new Response(buf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="moodlescout_${ts}.pdf"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (err) {
    logger.error({ err: (err as Error).message, sessionId: id, format }, 'Export échoué')
    return new Response(`Export échoué: ${(err as Error).message}`, { status: 500 })
  }
}

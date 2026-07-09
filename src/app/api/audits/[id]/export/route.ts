import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { checkAuditAccess } from '@/lib/audit-access'
import { exportToCsv, exportToExcel, exportToPdf } from '@/lib/exports'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Format YYYYMMDDTHHMMSS en heure locale du serveur. */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** Slug : retire tout sauf [A-Za-z0-9]. "P10 SEJAC3 (SEG, AES)" -> "P10SEJAC3SEGAES". */
function slugifyName(name: string): string {
  const slug = name.replace(/[^A-Za-z0-9]/g, '')
  return slug || 'audit'
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const url = new URL(req.url)
  const format = (url.searchParams.get('format') ?? 'excel').toLowerCase()
  if (format !== 'excel' && format !== 'pdf' && format !== 'csv') {
    return new Response('Format invalide (excel|pdf|csv)', { status: 400 })
  }

  const access = await checkAuditAccess(id, a.user)
  if (!access.ok) return access.response

  const session = await prisma.auditSession.findUnique({
    where: { id },
    select: {
      sessionKey: true,
      platform: { select: { name: true } },
      courseAudits: {
        where: { errorMessage: null },
        orderBy: { createdAt: 'asc' },
        select: { resultJson: true },
      },
    },
  })
  if (!session) return new Response('Introuvable', { status: 404 })

  const courses = session.courseAudits
    .map((c: { resultJson: unknown }) => c.resultJson)
    .filter((c: unknown): c is Record<string, any> => c !== null && typeof c === 'object')

  if (courses.length === 0) {
    return new Response('Aucun résultat à exporter', { status: 404 })
  }

  const slug = slugifyName(session.platform.name)
  const ts = formatTimestamp(new Date())
  const ext = format === 'excel' ? 'xlsx' : format
  const filename = `${slug}-${ts}.${ext}`

  try {
    if (format === 'excel') {
      const buf = await exportToExcel(courses)
      return new Response(buf as any, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buf.length),
        },
      })
    }
    if (format === 'csv') {
      const buf = exportToCsv(courses)
      return new Response(buf as any, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buf.length),
        },
      })
    }
    const buf = await exportToPdf(courses)
    return new Response(buf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (err) {
    logger.error({ err: (err as Error).message, sessionId: id, format }, 'Export échoué')
    return new Response(`Export échoué: ${(err as Error).message}`, { status: 500 })
  }
}

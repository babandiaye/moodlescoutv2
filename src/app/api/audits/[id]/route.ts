import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { checkAuditAccess } from '@/lib/audit-access'
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
    include: {
      user: { select: { id: true, fullName: true } },
      platform: { select: { id: true, name: true, url: true, version: true } },
      llmConfig: { select: { id: true, name: true, provider: true, model: true } },
      courseAudits: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          courseId: true,
          shortname: true,
          fullname: true,
          scoreGlobal: true,
          errorMessage: true,
          durationMs: true,
          resultJson: true,
          createdAt: true,
        },
      },
    },
  })
  return NextResponse.json({ session })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const access = await checkAuditAccess(id, a.user, true)
  if (!access.ok) return access.response

  // Refuse la suppression d'un audit en cours : le worker écrit encore dans
  // courseAudits, la cascade FK provoquerait des écritures orphelines et la
  // perte des résultats partiels. L'utilisateur doit d'abord annuler.
  if (access.audit.status === 'running' || access.audit.status === 'pending') {
    return NextResponse.json(
      { error: 'Annulez d\'abord l\'audit avant de le supprimer.' },
      { status: 409 },
    )
  }

  await prisma.auditSession.delete({ where: { id } })
  logger.info({ sessionId: id, by: a.user.id }, 'Audit supprimé')
  return NextResponse.json({ ok: true })
}

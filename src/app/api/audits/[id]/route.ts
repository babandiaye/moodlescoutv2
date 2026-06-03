import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import { canViewAudit, canModifyAudit } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

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
  if (!session) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (!canViewAudit(a.user.role, a.user.id, session.userId)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  return NextResponse.json({ session })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const session = await prisma.auditSession.findUnique({
    where: { id },
    select: { userId: true, status: true },
  })
  if (!session) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  // Suppression : on utilise canModifyAudit (plus strict) → le lecteur ne peut PAS supprimer.
  if (!canModifyAudit(a.user.role, a.user.id, session.userId)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  await prisma.auditSession.delete({ where: { id } })
  logger.info({ sessionId: id, by: a.user.id }, 'Audit supprimé')
  return NextResponse.json({ ok: true })
}

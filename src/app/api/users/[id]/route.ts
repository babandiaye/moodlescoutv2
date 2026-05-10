import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  role: z.enum(['admin', 'auditeur']).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, fullName: true, email: true },
  })
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  // Garde anti self-modification : un admin ne peut pas changer son propre rôle
  // ni se désactiver lui-même (sinon il peut perdre l'accès admin par erreur).
  if (target.id === a.user.id) {
    if (parsed.data.role !== undefined && parsed.data.role !== target.role) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier votre propre rôle. Demandez à un autre admin.' },
        { status: 400 },
      )
    }
    if (parsed.data.isActive === false) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas désactiver votre propre compte.' },
        { status: 400 },
      )
    }
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.role !== undefined) data.role = parsed.data.role
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      direction: true,
    },
  })

  logger.info(
    {
      by: a.user.id,
      target: target.id,
      changes: parsed.data,
      previousRole: target.role,
      previousActive: target.isActive,
    },
    'Utilisateur modifié par admin',
  )

  return NextResponse.json({ user: updated })
}

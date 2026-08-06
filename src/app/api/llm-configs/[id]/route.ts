import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { canDeleteLlm, canModifyLlm, canViewLlm } from '@/lib/llm-access'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// z.preprocess normalise "" → null pour compat UI (voir POST route.ts)
const nullableUrl = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.string().url().nullable(),
)
const nullableStr = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.string().min(8).nullable(),
)

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiUrl: nullableUrl.optional(),
  apiKey: nullableStr.optional(),
  model: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const existing = await prisma.llmConfig.findUnique({ where: { id } })
  // 404 volontaire même pour un admin qui tenterait de tomber sur une perso
  // d'un autre user — la privacy passe avant l'ergonomie de debug.
  if (!existing || !canViewLlm({ role: a.user.role, userId: a.user.id }, existing)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }
  if (!canModifyLlm({ role: a.user.role, userId: a.user.id }, existing)) {
    return NextResponse.json(
      { error: 'Vous ne pouvez pas modifier cette configuration' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const data: Record<string, any> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.apiUrl !== undefined) data.apiUrl = parsed.data.apiUrl
  if (parsed.data.model !== undefined) data.model = parsed.data.model
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (parsed.data.apiKey !== undefined) {
    data.apiKeyEnc = parsed.data.apiKey ? encrypt(parsed.data.apiKey) : null
  }

  // isDefault ne s'applique qu'aux configs shared, et modifiable par admin.
  // Le défaut PERSONNEL passe par PUT /api/me/default-llm.
  if (parsed.data.isDefault !== undefined) {
    if (existing.scope !== 'shared' || a.user.role !== 'admin') {
      return NextResponse.json(
        {
          error:
            'Le drapeau "défaut d\'usine" ne peut être modifié que par un admin sur une configuration partagée.',
        },
        { status: 403 },
      )
    }
    data.isDefault = parsed.data.isDefault
  }

  const updated = await prisma.$transaction(async tx => {
    if (data.isDefault === true) {
      // Décoche uniquement les autres défauts SHARED (les défauts personal
      // d'autres users ne sont pas notre affaire).
      await tx.llmConfig.updateMany({
        where: { scope: 'shared', isDefault: true, NOT: { id } },
        data: { isDefault: false },
      })
    }
    return tx.llmConfig.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        provider: true,
        apiUrl: true,
        model: true,
        scope: true,
        userId: true,
        isDefault: true,
        isActive: true,
        updatedAt: true,
      },
    })
  })

  logger.info({ id, byUserId: a.user.id }, 'Config LLM mise à jour')
  return NextResponse.json({ config: updated })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const existing = await prisma.llmConfig.findUnique({ where: { id } })
  if (!existing || !canViewLlm({ role: a.user.role, userId: a.user.id }, existing)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

  const gate = canDeleteLlm({ role: a.user.role, userId: a.user.id }, existing)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: 403 })
  }

  try {
    await prisma.llmConfig.delete({ where: { id } })
    logger.info({ id, byUserId: a.user.id }, 'Config LLM supprimée')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as any)?.code === 'P2025') {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }
    if ((err as any)?.code === 'P2003') {
      return NextResponse.json(
        {
          error:
            'Configuration référencée par des audits historiques — désactivez-la plutôt que la supprimer pour préserver les rapports passés.',
        },
        { status: 409 },
      )
    }
    throw err
  }
}

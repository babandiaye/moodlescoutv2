import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiUrl: z.string().url().nullable().optional(),
  apiKey: z.string().min(8).nullable().optional(),
  model: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response
  const { id } = await ctx.params

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

  const updated = await prisma.$transaction(async tx => {
    if (parsed.data.isDefault === true) {
      await tx.llmConfig.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      })
      data.isDefault = true
    } else if (parsed.data.isDefault === false) {
      data.isDefault = false
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
        isDefault: true,
        isActive: true,
        updatedAt: true,
      },
    })
  })

  logger.info({ id }, 'Config LLM mise à jour')
  return NextResponse.json({ config: updated })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response
  const { id } = await ctx.params

  try {
    await prisma.llmConfig.delete({ where: { id } })
    logger.info({ id }, 'Config LLM supprimée')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as any)?.code === 'P2025') {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }
    if ((err as any)?.code === 'P2003') {
      return NextResponse.json(
        { error: 'Config utilisée par des audits, suppression impossible' },
        { status: 409 },
      )
    }
    throw err
  }
}

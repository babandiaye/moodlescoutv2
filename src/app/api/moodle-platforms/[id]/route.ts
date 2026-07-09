import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { getSiteInfo } from '@/lib/moodle'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  token: z.string().min(10).optional(),
  version: z.string().optional(),
  isActive: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const platform = await prisma.moodlePlatform.findUnique({
    where: { id },
    select: { id: true, name: true, url: true, version: true, createdAt: true, updatedAt: true },
  })
  if (!platform) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  return NextResponse.json({ platform })
}

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

  const existing = await prisma.moodlePlatform.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const data: Record<string, any> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.version !== undefined) data.version = parsed.data.version
  if (parsed.data.url !== undefined) data.url = parsed.data.url
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive

  // Si on touche au token ou à l'URL, on revalide
  if (parsed.data.token !== undefined || parsed.data.url !== undefined) {
    const url = parsed.data.url ?? existing.url
    const token = parsed.data.token ?? '(unchanged)'
    if (parsed.data.token !== undefined) {
      try {
        await getSiteInfo(url, parsed.data.token)
      } catch (err) {
        return NextResponse.json(
          { error: `Connexion Moodle impossible : ${(err as Error).message}` },
          { status: 400 },
        )
      }
      data.tokenEnc = encrypt(parsed.data.token)
    }
    void token
  }

  const platform = await prisma.moodlePlatform.update({
    where: { id },
    data,
    select: { id: true, name: true, url: true, version: true, isActive: true, updatedAt: true },
  })
  logger.info({ id, isActive: data.isActive }, 'Plateforme Moodle mise à jour')
  return NextResponse.json({ platform })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response
  const { id } = await ctx.params

  try {
    await prisma.moodlePlatform.delete({ where: { id } })
    logger.info({ id }, 'Plateforme Moodle supprimée')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as any)?.code === 'P2025') {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }
    if ((err as any)?.code === 'P2003') {
      return NextResponse.json(
        { error: 'Plateforme utilisée par des audits, suppression impossible' },
        { status: 409 },
      )
    }
    throw err
  }
}

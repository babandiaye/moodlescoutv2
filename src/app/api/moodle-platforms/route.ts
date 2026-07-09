import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { getSiteInfo } from '@/lib/moodle'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  token: z.string().min(10),
  version: z.string().default('4'),
})

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const platforms = await prisma.moodlePlatform.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      version: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ platforms })
}

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, url, token, version } = parsed.data

  // Validation token via core_webservice_get_site_info
  try {
    await getSiteInfo(url, token)
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, url },
      'Plateforme Moodle: connexion échouée',
    )
    return NextResponse.json(
      { error: `Connexion Moodle impossible : ${(err as Error).message}` },
      { status: 400 },
    )
  }

  const tokenEnc = encrypt(token)
  const platform = await prisma.moodlePlatform.create({
    data: { name, url, tokenEnc, version },
    select: { id: true, name: true, url: true, version: true, createdAt: true },
  })
  logger.info({ id: platform.id, url }, 'Plateforme Moodle créée')
  return NextResponse.json({ platform }, { status: 201 })
}

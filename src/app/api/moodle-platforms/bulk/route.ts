import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  isActive: z.boolean(),
})

/**
 * PATCH /api/moodle-platforms/bulk
 *
 * Active ou désactive plusieurs plateformes en une seule opération.
 * Un non-admin ne voit pas les plateformes désactivées ni les cours/audits
 * qui y sont rattachés — c'est le mécanisme utilisé pour cacher une
 * plateforme au reste de l'organisation sans la supprimer.
 */
export async function PATCH(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { ids, isActive } = parsed.data
  const result = await prisma.moodlePlatform.updateMany({
    where: { id: { in: ids } },
    data: { isActive },
  })
  logger.info(
    { count: result.count, isActive, requested: ids.length, userId: a.user.id },
    'Plateformes Moodle: action par lot',
  )
  return NextResponse.json({ updated: result.count, requested: ids.length })
}

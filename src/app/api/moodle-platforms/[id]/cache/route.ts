import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * DELETE /api/moodle-platforms/[id]/cache
 *
 * Vide toutes les entrées Redis `moodle:ws:*:<baseUrl>:*` pour cette plateforme.
 * Utile quand un admin corrige quelque chose côté Moodle (rôle/service webservice,
 * capability, function ajoutée) et ne veut pas attendre l'expiration TTL 5-30 min.
 *
 * Note : ne vide PAS le cache par utilisateur (clé `u<uid>`) car il est
 * naturellement court (5 min) et scanner tous les userids est inutile ici.
 * Un utilisateur peut recharger sa page /me/courses avec ?refresh=1 pour ça.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const platform = await prisma.moodlePlatform.findUnique({
    where: { id },
    select: { url: true, name: true },
  })
  if (!platform) return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
  if (!redis) return NextResponse.json({ error: 'Redis indisponible' }, { status: 503 })

  const baseUrl = platform.url.replace(/\/+$/, '')
  const pattern = `moodle:ws:*:${baseUrl}:*`

  // SCAN + DEL par lots pour éviter de bloquer Redis sur un KEYS massif.
  let deleted = 0
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
    cursor = next
    if (keys.length > 0) {
      await redis.del(...keys)
      deleted += keys.length
    }
  } while (cursor !== '0')

  logger.info(
    { platformId: id, baseUrl, deleted, by: a.user.id },
    'Cache WS Moodle vidé',
  )
  return NextResponse.json({ ok: true, deleted, platform: platform.name })
}

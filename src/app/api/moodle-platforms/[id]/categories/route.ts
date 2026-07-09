import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { getCategoriesTree } from '@/lib/moodle'
import { buildPlatformCategoryTree } from '@/lib/category-stats'
import { isAdmin } from '@/lib/permissions'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/moodle-platforms/[id]/categories
 *
 * Retourne l'arbre catégoriel Moodle enrichi des scores agrégés d'audit.
 * Chaque nœud contient :
 *   - id, name, parent, depth, coursecount, children (récursif)
 *   - stats?: { coursesAudited, scoreAvg, scoreMin, scoreMax, conformes, conformesPct }
 *
 * Le cache Moodle WS (getCategoriesTree, TTL 30 min) est utilisé. Les stats
 * sont recalculées à chaque appel — c'est peu coûteux (1 SELECT avec DISTINCT
 * ON) et évite d'avoir un cache incohérent avec les audits qui viennent de
 * s'ajouter.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const platform = await prisma.moodlePlatform.findUnique({
    where: { id },
    select: { id: true, name: true, url: true, tokenEnc: true, isActive: true },
  })
  if (!platform) return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
  if (!platform.isActive && !isAdmin(a.user.role)) {
    return NextResponse.json({ error: 'Plateforme désactivée par l\'administrateur.' }, { status: 403 })
  }

  const start = Date.now()
  try {
    const token = decrypt(platform.tokenEnc)
    const moodleTree = await getCategoriesTree(platform.url, token)
    const { tree, hasStats, coursesAudited } = await buildPlatformCategoryTree(id, moodleTree)
    return NextResponse.json({
      platform: { id: platform.id, name: platform.name, url: platform.url },
      tree,
      hasStats,
      coursesAudited,
      computedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    })
  } catch (err) {
    logger.warn({ id, err: (err as Error).message }, 'Categories tree: échec')
    return NextResponse.json(
      { error: `Impossible de récupérer les catégories : ${(err as Error).message.slice(0, 200)}` },
      { status: 502 },
    )
  }
}

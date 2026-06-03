import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { redis } from '@/lib/redis'
import { requireAuth } from '@/lib/api-helpers'
import { getSiteInfo, getUsersTotalCount } from '@/lib/moodle'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const CACHE_TTL_SEC = 600 // 10 min

type Stats = {
  url: string
  sitename: string | null
  release: string | null
  version: string | null
  nbUsers: number | null
  /** Détail par méthode d'auth Moodle (manual, oidc, etc.) ou enrôlement selon la méthode */
  usersBreakdown: Record<string, number> | null
  /** True si au moins une méthode d'auth a échoué (total est borne basse) */
  usersBreakdownPartial: boolean
  /** Premier message d'erreur Moodle si nbUsers est null (capability manquante, etc.) */
  usersError: string | null
  /**
   * Méthode utilisée pour compter :
   * - 'auth-list' : core_user_get_users sommé par auth (= comptes totaux)
   * - 'enrolment' : core_enrol_get_enrolled_users distinct (= users inscrits ≥1 cours)
   */
  usersMethod: 'auth-list' | 'enrolment'
  /** Nombre de cours scannés (pertinent uniquement en mode 'enrolment') */
  usersNbCoursesScanned: number | null
  /** Compte Moodle qui détient le token webservice (username, ou null si site_info a échoué). */
  tokenUsername: string | null
  /** True si le compte du token est administrateur principal Moodle. */
  tokenIsAdmin: boolean
  /** True si la fonction core_user_get_users est exposée au service (= compte direct possible). */
  hasGetUsersFunction: boolean
  computedAt: string
  durationMs: number
  cached: boolean
}

async function readCache(id: string): Promise<Stats | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(`moodle:stats:${id}`)
    if (!raw) return null
    return { ...JSON.parse(raw), cached: true }
  } catch {
    return null
  }
}

async function writeCache(id: string, stats: Stats): Promise<void> {
  if (!redis) return
  try {
    await redis.set(`moodle:stats:${id}`, JSON.stringify(stats), 'EX', CACHE_TTL_SEC)
  } catch {
    // ignore
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const url = new URL(req.url)
  const refresh = url.searchParams.get('refresh') === '1'

  const platform = await prisma.moodlePlatform.findUnique({ where: { id } })
  if (!platform) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  if (!refresh) {
    const cached = await readCache(id)
    if (cached) return NextResponse.json(cached)
  }

  const start = Date.now()
  try {
    const token = decrypt(platform.tokenEnc)

    // 2 appels parallèles : infos site + comptage users (ce dernier somme N
    // sous-requêtes par méthode d'auth, voir getUsersTotalCount).
    const [siteInfo, usersResult] = await Promise.all([
      getSiteInfo(platform.url, token).catch(() => null),
      getUsersTotalCount(platform.url, token),
    ])

    const hasGetUsersFunction =
      siteInfo?.functions?.some(f => f.name === 'core_user_get_users') ?? false

    const stats: Stats = {
      url: platform.url,
      sitename: siteInfo?.sitename ?? null,
      release: siteInfo?.release ?? null,
      version: siteInfo?.version ?? null,
      nbUsers: usersResult.total,
      usersBreakdown: Object.keys(usersResult.breakdown).length > 0 ? usersResult.breakdown : null,
      usersBreakdownPartial: usersResult.partial,
      usersError: usersResult.errors[0] ?? null,
      usersMethod: usersResult.method,
      usersNbCoursesScanned: usersResult.nbCoursesScanned ?? null,
      tokenUsername: siteInfo?.username ?? null,
      tokenIsAdmin: siteInfo?.userissiteadmin ?? false,
      hasGetUsersFunction,
      computedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      cached: false,
    }
    await writeCache(id, stats)
    return NextResponse.json(stats)
  } catch (err) {
    const message = (err as Error).message
    logger.warn({ id, err: message }, 'Stats plateforme échouées')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

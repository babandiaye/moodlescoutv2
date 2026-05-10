import { NextResponse } from 'next/server'
import { peekRateLimit, requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mêmes seuils que dans POST /api/audits (à garder synchros)
const PER_USER_MAX = 5
const PER_USER_WINDOW = 300
const GLOBAL_MAX = 20
const GLOBAL_WINDOW = 300

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const [perUser, global] = await Promise.all([
    peekRateLimit(`audit-start:${a.user.id}`, PER_USER_MAX, PER_USER_WINDOW),
    peekRateLimit('audit-start:global', GLOBAL_MAX, GLOBAL_WINDOW),
  ])

  let blockedKind: 'user' | 'global' | null = null
  let retryAfterSec = 0
  if (perUser.remaining === 0) {
    blockedKind = 'user'
    retryAfterSec = perUser.retryAfterSec
  } else if (global.remaining === 0) {
    blockedKind = 'global'
    retryAfterSec = global.retryAfterSec
  }

  // Avertissement préventif : >= 80% du quota consommé
  const userNear = perUser.used >= Math.floor(perUser.limit * 0.8)
  const globalNear = global.used >= Math.floor(global.limit * 0.8)

  return NextResponse.json({
    perUser: {
      used: perUser.used,
      limit: perUser.limit,
      remaining: perUser.remaining,
      retryAfterSec: perUser.retryAfterSec,
      windowSec: perUser.windowSec,
    },
    global: {
      used: global.used,
      limit: global.limit,
      remaining: global.remaining,
      retryAfterSec: global.retryAfterSec,
      windowSec: global.windowSec,
    },
    blocked: blockedKind !== null,
    blockedKind,
    retryAfterSec,
    nearLimit: blockedKind === null && (userNear || globalNear),
    nearLimitKind: userNear ? 'user' : globalNear ? 'global' : null,
  })
}

import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

type AuthSuccess = {
  ok: true
  session: Session
  user: NonNullable<Session['user']>
}

type AuthFailure = {
  ok: false
  response: NextResponse
}

/**
 * Vérifie l'authentification et optionnellement le rôle requis.
 * Retourne soit { ok: true, session, user } soit { ok: false, response }.
 *
 * Différence avec le middleware : on revérifie isActive à chaque requête API
 * (défense en profondeur si le statut change pendant une session active).
 *
 * Usage :
 *   const a = await requireAuth({ role: 'admin' })
 *   if (!a.ok) return a.response
 *   // a.user.id, a.user.role, etc. disponibles
 */
export async function requireAuth(
  options: { role?: 'admin' | 'auditeur' } = {}
): Promise<AuthSuccess | AuthFailure> {
  const session = await auth()

  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  }

  if (!session.user.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Compte désactivé' }, { status: 403 }),
    }
  }

  if (options.role && session.user.role !== options.role) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }),
    }
  }

  return { ok: true, session, user: session.user }
}

/**
 * Limite le nombre de requêtes par identifiant (user, IP…) sur une fenêtre glissante.
 * Si Redis est indisponible, dégrade silencieusement (ne bloque rien).
 *
 * @param key  identifiant unique du compteur (ex: "audit-start:user-123")
 * @param max  nombre max de requêtes autorisées sur la fenêtre
 * @param windowSec  durée de la fenêtre en secondes
 * @returns null si OK, NextResponse 429 si dépassement
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSec: number
): Promise<NextResponse | null> {
  if (!redis) return null

  try {
    const fullKey = `ratelimit:${key}`
    const count = await redis.incr(fullKey)
    if (count === 1) {
      await redis.expire(fullKey, windowSec)
    }

    if (count > max) {
      const ttl = await redis.ttl(fullKey)
      logger.warn({ key, count, max, retryAfter: ttl }, 'Rate limit dépassé')
      return NextResponse.json(
        { error: `Trop de requêtes. Réessayez dans ${ttl}s.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(ttl),
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    return null
  } catch (err) {
    logger.error({ err: (err as Error).message, key }, 'Rate limit : erreur Redis')
    return null
  }
}

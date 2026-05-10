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

/** Format un nombre de secondes en "Xmin Ys" lisible. */
function humanizeSeconds(sec: number): string {
  if (sec <= 0) return '0s'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m} min` : `${m} min ${s}s`
}

/**
 * Limite le nombre de requêtes par identifiant (user, IP…) sur une fenêtre glissante.
 * Si Redis est indisponible, dégrade silencieusement (ne bloque rien).
 *
 * @param key  identifiant unique du compteur (ex: "audit-start:user-123")
 * @param max  nombre max de requêtes autorisées sur la fenêtre
 * @param windowSec  durée de la fenêtre en secondes
 * @param opts.kind  étiquette pour le message d'erreur ('user' | 'global' | autre)
 * @param opts.label texte descriptif pour le message ("votre quota personnel", "quota global")
 * @returns null si OK, NextResponse 429 si dépassement
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSec: number,
  opts?: { kind?: string; label?: string }
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
      logger.warn({ key, count, max, retryAfter: ttl, kind: opts?.kind }, 'Rate limit dépassé')
      const label = opts?.label ?? 'quota'
      return NextResponse.json(
        {
          error: `${label.charAt(0).toUpperCase() + label.slice(1)} atteint. Réessayez dans ${humanizeSeconds(ttl)}.`,
          kind: opts?.kind ?? 'rate-limit',
          retryAfterSec: ttl,
          limit: max,
          windowSec,
        },
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

/**
 * Lecture seule du compteur rate limit (n'incrémente pas).
 * Utile pour l'UI qui veut prévenir l'utilisateur AVANT qu'il submit
 * (afficher quota restant, désactiver le bouton si 0).
 */
export async function peekRateLimit(
  key: string,
  max: number,
  windowSec: number,
): Promise<{ used: number; remaining: number; limit: number; retryAfterSec: number; windowSec: number }> {
  const empty = { used: 0, remaining: max, limit: max, retryAfterSec: 0, windowSec }
  if (!redis) return empty
  try {
    const fullKey = `ratelimit:${key}`
    const usedStr = await redis.get(fullKey)
    const used = usedStr ? Number(usedStr) : 0
    if (used <= 0) return empty
    const ttl = await redis.ttl(fullKey)
    return {
      used,
      remaining: Math.max(0, max - used),
      limit: max,
      retryAfterSec: ttl > 0 ? ttl : 0,
      windowSec,
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, 'Peek rate limit : erreur Redis')
    return empty
  }
}

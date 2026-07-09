'use client'

import { useEffect, useState } from 'react'

type Quota = {
  perUser: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  global: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  blocked: boolean
  blockedKind: 'user' | 'global' | null
  retryAfterSec: number
  nearLimit: boolean
  nearLimitKind: 'user' | 'global' | null
}

function fmt(sec: number): string {
  if (sec <= 0) return '0s'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}min` : `${m}min${s}s`
}

/**
 * Badge dans la TopBar qui affiche le quota d'audits restant pour l'utilisateur.
 * Se met à jour toutes les 30s (lecture peekRateLimit, aucun incrément).
 *
 * États :
 *   - vert : quota confortable (>20 % restant)
 *   - orange : proche de la limite (≥ 80 % consommé)
 *   - rouge : quota atteint, indique le temps avant de pouvoir relancer
 *   - masqué : erreur ou aucun usage récent (>0 audits mais pas cette fenêtre)
 */
export function QuotaBadge() {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchQuota = async () => {
      try {
        const res = await fetch('/api/audits/quota', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as Quota
        if (!cancelled) {
          setQuota(data)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    fetchQuota()
    const interval = setInterval(fetchQuota, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (error || !quota) return null

  // Ne rien afficher si aucun quota consommé — évite le bruit visuel pour les
  // utilisateurs qui viennent d'arriver et n'ont encore rien lancé.
  if (quota.perUser.used === 0 && quota.global.used === 0) return null

  let variant: 'ok' | 'warn' | 'danger' = 'ok'
  let label = `${quota.perUser.remaining}/${quota.perUser.limit} audits`
  let title = `Quota personnel : ${quota.perUser.used}/${quota.perUser.limit} sur ${fmt(quota.perUser.windowSec)}`

  if (quota.blocked) {
    variant = 'danger'
    label = `Quota atteint · reset dans ${fmt(quota.retryAfterSec)}`
    title = quota.blockedKind === 'user'
      ? `Votre quota personnel est plein. Reset dans ${fmt(quota.perUser.retryAfterSec)}.`
      : `Le quota global de la plateforme est plein. Reset dans ${fmt(quota.global.retryAfterSec)}.`
  } else if (quota.nearLimit) {
    variant = 'warn'
    label = quota.nearLimitKind === 'global'
      ? `Quota global : ${quota.global.remaining} restants`
      : `${quota.perUser.remaining}/${quota.perUser.limit} audits`
    title = quota.nearLimitKind === 'global'
      ? `Attention : le quota GLOBAL est presque atteint (${quota.global.used}/${quota.global.limit}).`
      : `Attention : votre quota est presque atteint (${quota.perUser.used}/${quota.perUser.limit}).`
  }

  const colors = {
    ok:     { bg: 'rgba(46, 204, 113, 0.15)', color: '#16a34a', border: '#16a34a' },
    warn:   { bg: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '#f59e0b' },
    danger: { bg: 'rgba(239, 68, 68, 0.15)',  color: '#dc2626', border: '#ef4444' },
  }[variant]

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 12,
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

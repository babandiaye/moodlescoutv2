'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

type Props = { id: string }

/**
 * Bouton "Relancer" un audit terminé.
 *
 * Appelle POST /api/audits/[id]/relaunch qui crée une NOUVELLE session avec les
 * mêmes paramètres (plateforme, LLM, catégories, cours ciblés), la met en file,
 * puis redirige vers son détail.
 */
export function RelaunchAuditButton({ id }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (!confirm('Relancer cet audit ? Une nouvelle session sera créée avec les mêmes paramètres.')) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/audits/${id}/relaunch`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const newId = data.session?.id
      if (newId) {
        router.push(`/audits/${newId}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 12 }}
        onClick={handleClick}
        disabled={loading}
        title="Créer une nouvelle session d'audit avec les mêmes paramètres"
      >
        <ArrowPathIcon style={{ width: 14, height: 14 }} />
        {loading ? ' Relance…' : ' Relancer'}
      </button>
      {error && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--danger)',
            marginLeft: 8,
            maxWidth: 320,
            display: 'inline-block',
          }}
          title={error}
        >
          {error.length > 60 ? error.slice(0, 60) + '…' : error}
        </span>
      )}
    </>
  )
}

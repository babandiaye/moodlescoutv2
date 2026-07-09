'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { CategoryTreeBrowser, type CategoryNode } from './category-tree-browser'

type Props = { platformId: string }

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready'
      tree: CategoryNode[]
      hasStats: boolean
      coursesAudited: number
      durationMs: number
    }

/**
 * Charge et affiche le browser catégoriel côté client. Séparé de la page
 * serveur car le rendu de l'arbre + le fetch WS Moodle (30 min cache) peut
 * dépasser la limite de patience utilisateur en SSR — on affiche un
 * "chargement" propre à la place.
 */
export function PlatformCategoriesView({ platformId }: Props) {
  const router = useRouter()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [filter, setFilter] = useState('')

  const load = async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/moodle-platforms/${platformId}/categories`)
      const data = await res.json()
      if (!res.ok) {
        setState({ status: 'error', error: data.error ?? `HTTP ${res.status}` })
        return
      }
      setState({
        status: 'ready',
        tree: data.tree ?? [],
        hasStats: data.hasStats ?? false,
        coursesAudited: data.coursesAudited ?? 0,
        durationMs: data.durationMs ?? 0,
      })
    } catch (err) {
      setState({ status: 'error', error: (err as Error).message })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformId])

  const handleAudit = (node: CategoryNode) => {
    // Encodage minimal : on passe le NOM de la catégorie (le worker filtre par
    // substring insensible à la casse via `categoryFilter`). Sur les noms
    // exotiques ça reste robuste car le worker cherche dans tout le chemin.
    router.push(`/audits/new?platform=${platformId}&categories=${encodeURIComponent(node.name)}`)
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Explorateur catégoriel</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {state.status === 'ready' && state.hasStats && (
            <span className="badge badge-success">
              {state.coursesAudited} cours audités
            </span>
          )}
          {state.status === 'ready' && !state.hasStats && (
            <span className="badge badge-neutral">Aucun audit encore</span>
          )}
          <button
            type="button"
            onClick={load}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            disabled={state.status === 'loading'}
            title="Recharger les stats depuis la BD (l'arbre catégoriel Moodle est mis en cache 30 min)"
          >
            <ArrowPathIcon style={{ width: 12, height: 12 }} /> Recharger
          </button>
        </div>
      </div>
      <div className="card-body">
        {state.status === 'ready' && (
          <input
            type="text"
            placeholder="Filtrer par nom de catégorie…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--surface)',
              color: 'var(--text)',
              marginBottom: 10,
            }}
          />
        )}

        {state.status === 'loading' && (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement de l'arbre catégoriel…</p>
        )}
        {state.status === 'error' && (
          <div style={{ fontSize: 13, color: 'var(--danger)', padding: 12, background: 'var(--danger-light)', borderRadius: 6 }}>
            {state.error}
          </div>
        )}
        {state.status === 'ready' && (
          <CategoryTreeBrowser
            tree={state.tree}
            mode="dashboard"
            onAudit={handleAudit}
            filter={filter}
            defaultOpenDepth={1}
          />
        )}
      </div>
    </div>
  )
}

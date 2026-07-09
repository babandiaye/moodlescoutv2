'use client'

import { useEffect, useState } from 'react'
import { CategoryTreeBrowser, type CategoryNode } from './category-tree-browser'

type Props = {
  platformId: string
  /** Noms des catégories cochées (contrôlé de l'extérieur). */
  selectedNames: Set<string>
  onChange: (names: Set<string>) => void
}

/**
 * Panneau intégrable dans un formulaire pour cocher plusieurs catégories
 * d'une plateforme via l'arbre navigable. Ne stocke pas les noms en interne :
 * c'est le parent qui a le state (contrôlé). Fetch l'arbre au montage et à
 * chaque changement de plateforme.
 */
export function CategoryPickerPanel({ platformId, selectedNames, onChange }: Props) {
  const [tree, setTree] = useState<CategoryNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    fetch(`/api/moodle-platforms/${platformId}/categories`)
      .then(async res => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`)
          setTree(null)
          return
        }
        setTree(data.tree ?? [])
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [platformId])

  // Sélection par ID interne, mais on synchronise vers/depuis les noms (ce que
  // le worker consomme via categoryFilter). Résolution ID → nom via une passe
  // sur l'arbre. Le mapping se fait à la volée.
  const selectedIds = new Set<number>()
  if (tree) {
    const walk = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        if (selectedNames.has(n.name)) selectedIds.add(n.id)
        walk(n.children)
      }
    }
    walk(tree)
  }

  const toggleId = (id: number) => {
    if (!tree) return
    // Trouve le nom correspondant à l'id
    let foundName: string | null = null
    const walk = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        if (n.id === id) {
          foundName = n.name
          return
        }
        walk(n.children)
        if (foundName) return
      }
    }
    walk(tree)
    if (!foundName) return
    const next = new Set(selectedNames)
    if (next.has(foundName)) next.delete(foundName)
    else next.add(foundName)
    onChange(next)
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--surface2)',
        maxHeight: 340,
        overflowY: 'auto',
      }}
    >
      {loading && (
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Chargement…</p>
      )}
      {error && (
        <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
          Impossible de charger les catégories : {error}
        </p>
      )}
      {tree && !error && (
        <>
          <input
            type="text"
            placeholder="Filtrer les catégories…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--surface)',
              color: 'var(--text)',
              marginBottom: 8,
            }}
          />
          <CategoryTreeBrowser
            tree={tree}
            mode="select"
            selectedIds={selectedIds}
            onToggleSelect={toggleId}
            filter={filter}
            defaultOpenDepth={1}
          />
        </>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

export type CategoryNode = {
  id: number
  name: string
  parent: number
  depth: number
  coursecount: number
  children: CategoryNode[]
  stats?: {
    coursesAudited: number
    scoreAvg: number
    scoreMin: number
    scoreMax: number
    conformes: number
    conformesPct: number
  }
}

type Mode = 'dashboard' | 'select'

type Props = {
  tree: CategoryNode[]
  mode?: Mode
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  /** Callback pour "Auditer cette catégorie" (mode dashboard). */
  onAudit?: (node: CategoryNode) => void
  /** Nombre de niveaux ouverts par défaut (0 = tout fermé). */
  defaultOpenDepth?: number
  /** Recherche live sur nom (case-insensitive). Vide = tout affiché. */
  filter?: string
}

/**
 * Arbre navigable des catégories Moodle avec drill-down.
 * Deux modes :
 *   - 'dashboard' (défaut) : browsing + bouton "Auditer" sur chaque nœud
 *   - 'select' : checkboxes pour multi-sélection (utilisé dans /audits/new)
 *
 * Chaque nœud affiche :
 *   - nom + nombre de cours (fourni par Moodle)
 *   - si des stats existent : badge score moyen + code couleur + % conformes
 */
export function CategoryTreeBrowser({
  tree,
  mode = 'dashboard',
  selectedIds,
  onToggleSelect,
  onAudit,
  defaultOpenDepth = 1,
  filter = '',
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Ouvre les nœuds racine par défaut
    const s = new Set<number>()
    const walk = (nodes: CategoryNode[], d: number) => {
      for (const n of nodes) {
        if (d < defaultOpenDepth) s.add(n.id)
        walk(n.children, d + 1)
      }
    }
    walk(tree, 0)
    return s
  })

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Recherche : marque un nœud "matched" si son nom contient le filtre,
  // ET ouvre tout son chemin ancestral pour qu'il soit visible.
  const { matchedIds, forceOpen } = useMemo(() => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) return { matchedIds: null as Set<number> | null, forceOpen: new Set<number>() }
    const matched = new Set<number>()
    const open = new Set<number>()
    const walk = (nodes: CategoryNode[], ancestors: number[]): boolean => {
      let anyMatch = false
      for (const n of nodes) {
        const isMatch = n.name.toLowerCase().includes(trimmed)
        const childMatch = walk(n.children, [...ancestors, n.id])
        if (isMatch || childMatch) {
          matched.add(n.id)
          for (const a of ancestors) open.add(a)
          open.add(n.id)
          anyMatch = true
        }
      }
      return anyMatch
    }
    walk(tree, [])
    return { matchedIds: matched, forceOpen: open }
  }, [tree, filter])

  const isExpanded = (id: number) => expanded.has(id) || forceOpen.has(id)

  if (tree.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text3)', padding: 16 }}>
        Aucune catégorie trouvée sur cette plateforme.
      </p>
    )
  }

  return (
    <div className="category-tree" style={{ fontSize: 13 }}>
      {tree.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          mode={mode}
          expanded={isExpanded}
          onToggle={toggle}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onAudit={onAudit}
          matchedIds={matchedIds}
        />
      ))}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  mode,
  expanded,
  onToggle,
  selectedIds,
  onToggleSelect,
  onAudit,
  matchedIds,
}: {
  node: CategoryNode
  depth: number
  mode: Mode
  expanded: (id: number) => boolean
  onToggle: (id: number) => void
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onAudit?: (node: CategoryNode) => void
  matchedIds: Set<number> | null
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded(node.id)
  const isSelected = selectedIds?.has(node.id) ?? false
  // Si un filtre est actif : n'affiche que les nœuds qui matchent ou dont un
  // descendant matche (matchedIds contient déjà cet ensemble).
  if (matchedIds && !matchedIds.has(node.id)) return null

  const scoreColor = node.stats
    ? node.stats.scoreAvg >= 75 ? '#16a34a'
    : node.stats.scoreAvg >= 50 ? '#d97706'
    : '#dc2626'
    : undefined

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          paddingLeft: 6 + depth * 18,
          borderRadius: 4,
          minHeight: 30,
        }}
        className="category-row"
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text2)',
            }}
            aria-label={isOpen ? 'Réduire' : 'Développer'}
          >
            {isOpen
              ? <ChevronDownIcon style={{ width: 14, height: 14 }} />
              : <ChevronRightIcon style={{ width: 14, height: 14 }} />}
          </button>
        ) : (
          <span style={{ width: 14, display: 'inline-block' }} />
        )}

        {mode === 'select' && onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(node.id)}
            style={{ cursor: 'pointer' }}
            aria-label={`Sélectionner ${node.name}`}
          />
        )}

        <span
          style={{
            fontWeight: depth === 0 ? 600 : 500,
            color: 'var(--text)',
            cursor: hasChildren ? 'pointer' : 'default',
          }}
          onClick={() => hasChildren && onToggle(node.id)}
        >
          {node.name}
        </span>

        <span
          className="badge badge-neutral"
          style={{ fontSize: 10 }}
          title={`${node.coursecount} cours dans cette catégorie (hors sous-catégories)`}
        >
          {node.coursecount}
        </span>

        {node.stats && node.stats.coursesAudited > 0 && (
          <>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                background: `${scoreColor}20`,
                color: scoreColor,
                border: `1px solid ${scoreColor}`,
              }}
              title={`Score moyen : ${node.stats.scoreAvg}/100 (min ${node.stats.scoreMin} · max ${node.stats.scoreMax})`}
            >
              {node.stats.scoreAvg}/100
            </span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>
              {node.stats.coursesAudited} audité{node.stats.coursesAudited > 1 ? 's' : ''}
              {' · '}
              {node.stats.conformesPct}% conformes
            </span>
          </>
        )}

        {mode === 'dashboard' && onAudit && (
          <button
            type="button"
            onClick={() => onAudit(node)}
            className="btn btn-secondary"
            style={{
              fontSize: 10,
              padding: '2px 8px',
              marginLeft: 'auto',
            }}
            title={`Lancer un audit sur tous les cours de « ${node.name} »`}
          >
            Auditer
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              mode={mode}
              expanded={expanded}
              onToggle={onToggle}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onAudit={onAudit}
              matchedIds={matchedIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}

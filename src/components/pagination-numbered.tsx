'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/pagination-options'

type Props = {
  page: number
  pageSize: number
  total: number
}

/**
 * Pagination "Précédent · 1 2 3 · Suivant" avec sélecteur "X par page".
 * Préserve tous les query params (filtres, taille) — n'écrase que `page`
 * et `size`.
 *
 * Affiche max 5 numéros de page avec ellipses (…) quand il y en a beaucoup.
 * Une seule page → composant retourne null (rien à paginer).
 */
export function PaginationNumbered({ page, pageSize, total }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const nbPages = Math.max(1, Math.ceil(total / pageSize))
  if (nbPages <= 1 && total <= pageSize) {
    // Toujours afficher le sélecteur "par page" même sur 1 page, pour laisser
    // le choix de la taille
  }

  const go = (nextPage: number, nextSize: number) => {
    const sp = new URLSearchParams(params.toString())
    if (nextPage === 1) sp.delete('page')
    else sp.set('page', String(nextPage))
    if (nextSize === DEFAULT_PAGE_SIZE) sp.delete('size')
    else sp.set('size', String(nextSize))
    const qs = sp.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const pageNums = computePageNums(page, nbPages)

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div className="pagination-nav">
        <button
          type="button"
          className="pag-btn"
          onClick={() => go(page - 1, pageSize)}
          disabled={page <= 1}
        >
          <ChevronLeftIcon width={14} height={14} /> Précédent
        </button>
        {pageNums.map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="pag-ellipsis">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pag-btn ${n === page ? 'active' : ''}`}
              onClick={() => go(n, pageSize)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pag-btn"
          onClick={() => go(page + 1, pageSize)}
          disabled={page >= nbPages}
        >
          Suivant <ChevronRightIcon width={14} height={14} />
        </button>
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
        <select
          value={pageSize}
          onChange={e => go(1, Number(e.target.value))}
          style={{
            padding: '6px 8px', border: '1px solid var(--border2)',
            borderRadius: 8, fontSize: 12, cursor: 'pointer',
            background: 'var(--surface)', color: 'var(--text)',
          }}
        >
          {PAGE_SIZE_OPTIONS.map(n => (
            <option key={n} value={n}>{n} par page</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Génère la liste des numéros à afficher avec ellipses. Toujours affiche
 * la 1ère, la dernière, et 2 voisines autour de la courante.
 */
function computePageNums(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const nums: (number | '…')[] = []
  const window = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...window].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) nums.push('…')
    nums.push(n)
    prev = n
  }
  return nums
}

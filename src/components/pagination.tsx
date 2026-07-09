'use client'

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination-options'

export { PAGE_SIZE_OPTIONS } from '@/lib/pagination-options'
export type { PageSize } from '@/lib/pagination-options'

type Props = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="pagination">
      <div className="pagination-info">
        {total === 0 ? 'Aucun résultat' : `${start}–${end} sur ${total}`}
      </div>
      <div className="pagination-controls">
        <label className="pagination-size">
          Par page
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="pagination-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeftIcon style={{ width: 14, height: 14 }} />
        </button>
        <span className="pagination-page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="pagination-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
        >
          <ChevronRightIcon style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

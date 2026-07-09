'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Pagination } from './pagination'
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination-options'

type Props = {
  page: number
  pageSize: number
  total: number
}

/**
 * Variante de <Pagination /> qui pousse les changements dans l'URL
 * (?page=, ?size=) au lieu d'un state local — pour les pages SSR.
 * Préserve les autres searchParams (filtres, recherche, etc.).
 */
export function PaginationUrl({ page, pageSize, total }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = (nextPage: number, nextSize: number) => {
    const sp = new URLSearchParams(params.toString())
    if (nextPage === 1) sp.delete('page')
    else sp.set('page', String(nextPage))
    if (nextSize === DEFAULT_PAGE_SIZE) sp.delete('size')
    else sp.set('size', String(nextSize))
    const qs = sp.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={p => push(p, pageSize)}
      onPageSizeChange={s => push(1, s)}
    />
  )
}

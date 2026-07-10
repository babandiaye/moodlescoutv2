'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

type PlatformOpt = { id: string; name: string }

type Props = {
  platforms: PlatformOpt[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tous statuts' },
  { value: 'completed', label: 'Terminés' },
  { value: 'running', label: 'En cours' },
  { value: 'pending', label: 'En attente' },
  { value: 'failed', label: 'Échoués' },
  { value: 'cancelled', label: 'Annulés' },
]

/**
 * Barre de filtres pour /audits.
 *
 * Autosubmit :
 *  - Selects (plateforme, statut) et dates : push URL immédiat au changement
 *  - Champ texte : debounce 500 ms pour éviter un push à chaque frappe
 *
 * Ainsi l'utilisateur voit la liste se filtrer en direct sans avoir à
 * cliquer un bouton. Seul « Réinitialiser » subsiste.
 */
export function AuditsFilters({ platforms }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const [q, setQ] = useState(sp.get('q') ?? '')
  const [platformId, setPlatformId] = useState(sp.get('platformId') ?? '')
  const [status, setStatus] = useState(sp.get('status') ?? '')
  const [from, setFrom] = useState(sp.get('from') ?? '')
  const [to, setTo] = useState(sp.get('to') ?? '')

  const hasFilter = q || platformId || status || from || to

  const buildUrl = (
    over: Partial<{ q: string; platformId: string; status: string; from: string; to: string }> = {},
  ) => {
    const next = new URLSearchParams()
    const vq = 'q' in over ? over.q : q
    const vp = 'platformId' in over ? over.platformId : platformId
    const vs = 'status' in over ? over.status : status
    const vf = 'from' in over ? over.from : from
    const vt = 'to' in over ? over.to : to
    if (vq) next.set('q', vq)
    if (vp) next.set('platformId', vp)
    if (vs) next.set('status', vs)
    if (vf) next.set('from', vf)
    if (vt) next.set('to', vt)
    // Conserver la taille de page choisie, reset la page à 1
    const size = sp.get('size')
    if (size) next.set('size', size)
    const qs = next.toString()
    return qs ? `/audits?${qs}` : '/audits'
  }

  // Debounce du champ texte (500 ms) — évite de spammer les navigations à
  // chaque frappe. Les autres champs poussent au onChange direct.
  useEffect(() => {
    if (q === (sp.get('q') ?? '')) return
    const t = setTimeout(() => {
      router.push(buildUrl({ q }))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const reset = () => {
    setQ('')
    setPlatformId('')
    setStatus('')
    setFrom('')
    setTo('')
    router.push('/audits')
  }

  return (
    <div className="filters-card">
      <div className="filters-grid">
        <div className="filters-field">
          <label className="filters-field-label">Clé d&apos;audit</label>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="audit-2026…"
          />
        </div>
        <div className="filters-field">
          <label className="filters-field-label">Plateforme</label>
          <select
            value={platformId}
            onChange={e => {
              const v = e.target.value
              setPlatformId(v)
              router.push(buildUrl({ platformId: v }))
            }}
          >
            <option value="">Toutes</option>
            {platforms.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="filters-field">
          <label className="filters-field-label">Statut</label>
          <select
            value={status}
            onChange={e => {
              const v = e.target.value
              setStatus(v)
              router.push(buildUrl({ status: v }))
            }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="filters-field">
          <label className="filters-field-label">Du</label>
          <input
            type="date"
            value={from}
            onChange={e => {
              const v = e.target.value
              setFrom(v)
              router.push(buildUrl({ from: v }))
            }}
          />
        </div>
        <div className="filters-field">
          <label className="filters-field-label">Au</label>
          <input
            type="date"
            value={to}
            onChange={e => {
              const v = e.target.value
              setTo(v)
              router.push(buildUrl({ to: v }))
            }}
          />
        </div>
        <div className="filters-reset">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={reset}
            disabled={!hasFilter}
            title="Réinitialiser tous les filtres"
          >
            <ArrowPathIcon width={14} height={14} /> Réinitialiser
          </button>
        </div>
      </div>
    </div>
  )
}

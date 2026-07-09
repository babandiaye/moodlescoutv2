'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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
 * Pousse les valeurs en query params (`q`, `platformId`, `status`, `from`, `to`)
 * et reset la page à 1. Le rendu final est server-side dans la page.
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

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault()
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (platformId) next.set('platformId', platformId)
    if (status) next.set('status', status)
    if (from) next.set('from', from)
    if (to) next.set('to', to)
    // Conserver la taille de page choisie, mais reset la page
    const size = sp.get('size')
    if (size) next.set('size', size)
    const qs = next.toString()
    router.push(qs ? `/audits?${qs}` : '/audits')
  }

  const reset = () => {
    setQ('')
    setPlatformId('')
    setStatus('')
    setFrom('')
    setTo('')
    router.push('/audits')
  }

  return (
    <form
      onSubmit={apply}
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'end',
        padding: 12,
        marginBottom: 12,
        background: 'var(--surface2)',
        borderRadius: 6,
        border: '1px solid var(--border)',
      }}
    >
      <FieldGroup label="Clé d'audit">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="audit-2026…"
          style={inputStyle}
        />
      </FieldGroup>
      <FieldGroup label="Plateforme">
        <select
          value={platformId}
          onChange={e => setPlatformId(e.target.value)}
          style={{ ...inputStyle, minWidth: 140 }}
        >
          <option value="">Toutes</option>
          {platforms.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Statut">
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ ...inputStyle, minWidth: 130 }}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Du">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
      </FieldGroup>
      <FieldGroup label="Au">
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
      </FieldGroup>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          Filtrer
        </button>
        {hasFilter && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={reset}
          >
            Réinitialiser
          </button>
        )}
      </div>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--surface)',
  color: 'var(--text)',
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

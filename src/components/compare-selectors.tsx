'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type AuditOption = {
  id: string
  sessionKey: string
  status: string
  createdAt: string
  totalCourses: number
  doneCourses: number
  platformId: string
  platformName: string
}

type Props = {
  available: AuditOption[]
  initialFrom: string
  initialTo: string
}

/**
 * Deux sélecteurs "audit from / audit to" + bouton Comparer.
 * Pousse `?from=X&to=Y` sur la page compare. Filtre auto le second sélecteur
 * pour ne proposer que des audits de la MÊME plateforme que le premier (évite
 * le choix incohérent + le message d'erreur).
 */
export function CompareSelectors({ available, initialFrom, initialTo }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  // Plateforme du 1er audit sélectionné → filtre pour le 2e
  const fromAudit = useMemo(() => available.find(a => a.id === from), [available, from])
  const compatibleForTo = useMemo(
    () => (fromAudit ? available.filter(a => a.platformId === fromAudit.platformId && a.id !== fromAudit.id) : available),
    [available, fromAudit],
  )

  const canCompare = from && to && from !== to

  const submit = () => {
    if (!canCompare) return
    router.push(`/audits/compare?from=${from}&to=${to}`)
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <label className="form-label">Audit A</label>
        <select
          value={from}
          onChange={e => {
            setFrom(e.target.value)
            // Reset le 2e si sa plateforme ne matche plus
            const a = available.find(x => x.id === e.target.value)
            const b = available.find(x => x.id === to)
            if (a && b && a.platformId !== b.platformId) setTo('')
          }}
          style={selectStyle}
        >
          <option value="">— Choisir un audit —</option>
          {available.map(a => (
            <option key={a.id} value={a.id}>
              {a.platformName} · {a.sessionKey.slice(0, 22)} · {new Date(a.createdAt).toLocaleDateString('fr-FR')} · {a.doneCourses}/{a.totalCourses} cours
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        <label className="form-label">Audit B</label>
        <select
          value={to}
          onChange={e => setTo(e.target.value)}
          style={selectStyle}
          disabled={!from}
        >
          <option value="">
            {from ? '— Choisir un audit sur la même plateforme —' : '— Sélectionnez d\'abord l\'audit A —'}
          </option>
          {compatibleForTo.map(a => (
            <option key={a.id} value={a.id}>
              {a.sessionKey.slice(0, 22)} · {new Date(a.createdAt).toLocaleDateString('fr-FR')} · {a.doneCourses}/{a.totalCourses} cours
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={submit}
        disabled={!canCompare}
        style={{ height: 34 }}
      >
        Comparer
      </button>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--surface)',
  color: 'var(--text)',
}

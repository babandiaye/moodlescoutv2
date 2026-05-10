'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  id: string
  sessionKey: string
}

export function DeleteAuditButton({ id, sessionKey }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!confirm(`Supprimer l'audit ${sessionKey} et tous ses résultats ?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/audits/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Erreur : ${data.error ?? res.status}`)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-danger"
      style={{ fontSize: 12, padding: '6px 10px' }}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? '…' : 'Supprimer'}
    </button>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = { id: string }

export function CancelAuditButton({ id }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (
      !confirm(
        "Arrêter l'audit ?\n\nLes cours déjà traités seront conservés et exportables. Cette action est irréversible.",
      )
    )
      return
    setLoading(true)
    try {
      const res = await fetch(`/api/audits/${id}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
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
      style={{ fontSize: 12 }}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? '…' : '⏹ Arrêter'}
    </button>
  )
}

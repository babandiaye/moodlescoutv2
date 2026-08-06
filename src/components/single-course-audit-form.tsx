'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AcademicCapIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  PlayIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

type LlmConfig = { id: string; name: string; provider: string; model: string; isDefault: boolean; scope?: 'shared' | 'personal' }

type Match = {
  platformId: string
  platformName: string
  platformUrl: string
  courseId: number
  shortname: string
  fullname: string
}

type ResolveState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; matches: Match[]; kind: 'url' | 'shortname' | 'id' }
  | { status: 'error'; error: string }

type Props = { llmConfigs: LlmConfig[]; myDefaultLlmConfigId?: string | null }

export function SingleCourseAuditForm({ llmConfigs, myDefaultLlmConfigId }: Props) {
  const router = useRouter()
  const defaultLlm =
    (myDefaultLlmConfigId ? llmConfigs.find(c => c.id === myDefaultLlmConfigId) : undefined) ??
    llmConfigs.find(c => c.isDefault) ??
    llmConfigs[0]
  const [input, setInput] = useState('')
  const [llmConfigId, setLlmConfigId] = useState(defaultLlm?.id ?? '')
  const [extractImages, setExtractImages] = useState(true)
  const [quizDetail, setQuizDetail] = useState<'meta' | 'detail' | 'both'>('both')
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null)
  const [resolve, setResolve] = useState<ResolveState>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Résolution debounced à chaque changement de l'input. On garde 700 ms —
  // c'est plus long que le preflight (500 ms) car un WS Moodle peut être lent.
  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed.length < 2) {
      setResolve({ status: 'idle' })
      setSelectedPlatformId(null)
      return
    }
    setResolve({ status: 'searching' })
    const timer = setTimeout(async () => {
      try {
        const url = `/api/audits/course?input=${encodeURIComponent(trimmed)}`
        const res = await fetch(url)
        // On lit d'abord en texte pour éviter "Unexpected token '<'" si le
        // serveur nous renvoie une page HTML (crash 500, page nginx, etc.).
        const text = await res.text()
        let data: {
          ok?: boolean
          matches?: Match[]
          kind?: 'url' | 'shortname' | 'id'
          error?: string
        } = {}
        try {
          data = JSON.parse(text)
        } catch {
          setResolve({
            status: 'error',
            error: `Réponse serveur inattendue (HTTP ${res.status}). Vérifiez les logs.`,
          })
          return
        }
        if (!res.ok) {
          setResolve({ status: 'error', error: data.error ?? `HTTP ${res.status}` })
          return
        }
        if (data.ok === false) {
          setResolve({ status: 'error', error: data.error ?? 'Erreur inconnue' })
          return
        }
        setResolve({
          status: 'found',
          matches: data.matches ?? [],
          kind: data.kind ?? 'shortname',
        })
        setSelectedPlatformId((data.matches ?? []).length === 1 ? data.matches![0].platformId : null)
      } catch (err) {
        setResolve({ status: 'error', error: (err as Error).message })
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [input])

  const canSubmit =
    resolve.status === 'found' &&
    resolve.matches.length > 0 &&
    (resolve.matches.length === 1 || selectedPlatformId !== null) &&
    llmConfigId !== '' &&
    !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/audits/course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: input.trim(),
          llmConfigId,
          platformId: selectedPlatformId ?? undefined,
          extractImages,
          quizDetail,
        }),
      })
      const text = await res.text()
      let data: { session?: { id: string }; error?: string } = {}
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Réponse serveur inattendue (HTTP ${res.status}).`)
      }
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      if (!data.session?.id) throw new Error('Réponse serveur sans session.')
      router.push(`/audits/${data.session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex-col-20">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <MagnifyingGlassIcon className="card-icon" /> Analyser un cours spécifique
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            Collez l&apos;<strong>URL du cours</strong> (ex.{' '}
            <code>https://p1369rlshepw.unchk.sn/course/view.php?id=981</code>), son{' '}
            <strong>code court</strong> (shortname, ex. <code>SOCIO1261</code>) ou son{' '}
            <strong>ID numérique</strong>. L&apos;audit détectera automatiquement la plateforme.
          </p>
          <input
            type="text"
            placeholder="URL, code ou ID du cours…"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ width: '100%', fontFamily: 'var(--mono)' }}
            required
          />
          <div style={{ marginTop: 12 }}>
            <ResolveResult
              state={resolve}
              selectedPlatformId={selectedPlatformId}
              onSelect={setSelectedPlatformId}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <CpuChipIcon className="card-icon" /> Configuration LLM
          </span>
        </div>
        <div className="card-body">
          <select value={llmConfigId} onChange={e => setLlmConfigId(e.target.value)}>
            {llmConfigs.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.provider}/{c.model}
                {c.isDefault ? ' (défaut)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Cog6ToothIcon className="card-icon" /> Options
          </span>
        </div>
        <div className="card-body">
          <div className="config-layout">
            <div className="form-group">
              <label className="form-label">Profondeur quiz</label>
              <select value={quizDetail} onChange={e => setQuizDetail(e.target.value as 'meta' | 'detail' | 'both')}>
                <option value="meta">Méta uniquement</option>
                <option value="detail">Détail par étudiant</option>
                <option value="both">Les deux (recommandé)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Analyse des images</label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={extractImages}
                  onChange={e => setExtractImages(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)', marginTop: 2 }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Analyser les images du cours (OCR bandeaux)
                  <br />
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {extractImages
                      ? 'Utile pour extraire nom prof / matière depuis un bandeau. Audit ~50 % plus lent.'
                      : '⚡ Audit accéléré. Les noms d\'enseignants sur bandeaux ne seront pas récupérés.'}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div
          className="card-body"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            L&apos;audit ne traitera que ce cours (rapide — quelques secondes à quelques minutes selon le LLM).
          </div>
          <button
            type="submit"
            className="btn-launch"
            disabled={!canSubmit}
            title={!canSubmit ? 'Renseignez d\'abord un cours identifiable.' : undefined}
          >
            {submitting ? (
              'Création…'
            ) : (
              <>
                <PlayIcon style={{ width: 14, height: 14 }} /> Analyser ce cours
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}

function ResolveResult({
  state,
  selectedPlatformId,
  onSelect,
}: {
  state: ResolveState
  selectedPlatformId: string | null
  onSelect: (id: string) => void
}) {
  if (state.status === 'idle') {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
        Saisissez au moins 2 caractères pour lancer la recherche.
      </div>
    )
  }
  if (state.status === 'searching') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
        <ArrowPathIcon style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
        Recherche sur toutes les plateformes…
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 13,
          color: 'var(--danger)',
          padding: '8px 10px',
          background: 'var(--danger-light)',
          borderRadius: 'var(--radius)',
        }}
      >
        <XCircleIcon style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
        <span>{state.error}</span>
      </div>
    )
  }
  // status === 'found'
  const single = state.matches.length === 1
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--success)',
          marginBottom: 8,
        }}
      >
        <CheckCircleIcon style={{ width: 16, height: 16 }} />
        {single ? '1 cours trouvé.' : `${state.matches.length} cours trouvés — sélectionnez-en un :`}
      </div>
      <div className="platform-list">
        {state.matches.map(m => (
          <label
            key={m.platformId + ':' + m.courseId}
            className="platform-item"
            style={{
              cursor: single ? 'default' : 'pointer',
              borderColor: selectedPlatformId === m.platformId ? 'var(--brand)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              {!single && (
                <input
                  type="radio"
                  name="platformChoice"
                  value={m.platformId}
                  checked={selectedPlatformId === m.platformId}
                  onChange={() => onSelect(m.platformId)}
                  style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--brand2)' }}>
                    {m.shortname}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{m.fullname}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  Plateforme : {m.platformName} · ID Moodle : {m.courseId}
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>
      {!single && selectedPlatformId === null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--warn)',
            marginTop: 8,
          }}
        >
          <ExclamationTriangleIcon style={{ width: 14, height: 14 }} />
          Sélectionnez une plateforme pour activer le lancement.
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AcademicCapIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  FolderIcon,
} from '@heroicons/react/24/outline'
import { CategoryPickerPanel } from './category-picker-panel'

const ICON_INLINE = { width: 14, height: 14, verticalAlign: '-3px', display: 'inline-block' as const }

type PreflightCheck = { ok: boolean; latencyMs: number; message: string }
type PreflightState = {
  status: 'idle' | 'running' | 'done' | 'error'
  ok: boolean
  checks?: { platform: PreflightCheck; llm: PreflightCheck; model: PreflightCheck }
  error?: string
}

type Platform = { id: string; name: string; url: string; version: string }
type LlmConfig = { id: string; name: string; provider: string; model: string; isDefault: boolean }

type QuotaInfo = {
  perUser: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  global: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  blocked: boolean
  blockedKind: 'user' | 'global' | null
  retryAfterSec: number
  nearLimit: boolean
  nearLimitKind: 'user' | 'global' | null
}

type Props = {
  platforms: Platform[]
  llmConfigs: LlmConfig[]
  /** Plateforme pré-sélectionnée (venant de /me/courses via ?platform=). */
  preselectedPlatformId?: string | null
  /** Sous-ensemble de courseIds Moodle à auditer (venant de /me/courses). */
  preselectedCourseIds?: number[]
  /** Catégories pré-sélectionnées (venant de /plateformes/[id] via ?categories=). */
  preselectedCategories?: string[]
}

function formatMmSs(sec: number): string {
  if (sec <= 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function NewAuditForm({
  platforms,
  llmConfigs,
  preselectedPlatformId,
  preselectedCourseIds,
  preselectedCategories,
}: Props) {
  const router = useRouter()
  const defaultLlm = llmConfigs.find(c => c.isDefault) ?? llmConfigs[0]
  // Si /me/courses a pré-sélectionné une plateforme valide, on l'utilise.
  const initialPlatform =
    preselectedPlatformId && platforms.some(p => p.id === preselectedPlatformId)
      ? preselectedPlatformId
      : platforms[0]?.id ?? ''
  const [form, setForm] = useState({
    platformId: initialPlatform,
    llmConfigId: defaultLlm?.id ?? '',
    extractImages: true,
    quizDetail: 'both' as 'meta' | 'detail' | 'both',
    categoriesText: (preselectedCategories ?? []).join(', '),
  })
  // Panneau catégoriel (Explorateur intégré) : ouvert par défaut si une
  // catégorie a été présélectionnée depuis /plateformes/[id].
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(
    (preselectedCategories?.length ?? 0) > 0,
  )
  // Mapping du texte séparé virgule → Set de noms. Recalculé à chaque frappe
  // pour que le picker reflète bien ce qui est effectivement dans le champ.
  const selectedCategoryNames = useMemo(() => {
    return new Set(
      (form.categoriesText ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
  }, [form.categoriesText])
  // Sous-ensemble d'IDs de cours à auditer (feature "Auditer mes cours").
  // Vide = comportement historique (tous les cours de la plateforme).
  const courseIds = preselectedCourseIds ?? []
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-flight : plateforme joignable + LLM/modèle prêt. Bloque le lancement
  // si un check échoue — évite de créer un audit qui va crasher à la 1re
  // requête Moodle ou attendre 10 min avant de découvrir qu'Ollama est down.
  const [preflight, setPreflight] = useState<PreflightState>({ status: 'idle', ok: false })

  // Quota rate limit (lecture seule pour avertir avant le clic)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [countdown, setCountdown] = useState(0)

  // Charge le quota au mount et le rafraîchit après chaque tentative
  const loadQuota = async () => {
    try {
      const res = await fetch('/api/audits/quota')
      if (!res.ok) return
      const data: QuotaInfo = await res.json()
      setQuota(data)
      setCountdown(data.retryAfterSec)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadQuota()
  }, [])

  // Pre-flight : re-run 500 ms après tout changement plateforme/LLM.
  // Debounce évite de spammer les WS pendant qu'on clique dans le formulaire.
  useEffect(() => {
    if (!form.platformId || !form.llmConfigId) return
    setPreflight({ status: 'running', ok: false })
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/audits/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformId: form.platformId, llmConfigId: form.llmConfigId }),
        })
        const data = await res.json()
        if (!res.ok) {
          setPreflight({ status: 'error', ok: false, error: data.error ?? `HTTP ${res.status}` })
          return
        }
        setPreflight({ status: 'done', ok: data.ok, checks: data.checks })
      } catch (err) {
        setPreflight({ status: 'error', ok: false, error: (err as Error).message })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [form.platformId, form.llmConfigId])

  const runPreflight = async () => {
    if (!form.platformId || !form.llmConfigId) return
    setPreflight({ status: 'running', ok: false })
    try {
      const res = await fetch('/api/audits/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformId: form.platformId, llmConfigId: form.llmConfigId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPreflight({ status: 'error', ok: false, error: data.error ?? `HTTP ${res.status}` })
        return
      }
      setPreflight({ status: 'done', ok: data.ok, checks: data.checks })
    } catch (err) {
      setPreflight({ status: 'error', ok: false, error: (err as Error).message })
    }
  }

  // Compteur live qui décrémente chaque seconde quand on est bloqué
  useEffect(() => {
    if (countdown <= 0) return
    const interval = setInterval(() => {
      setCountdown(c => {
        const next = c - 1
        if (next <= 0) {
          // Quota libéré : rafraîchit l'état complet
          loadQuota()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [countdown])

  const isBlocked = quota?.blocked || countdown > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const categories = form.categoriesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformId: form.platformId,
          llmConfigId: form.llmConfigId,
          extractImages: form.extractImages,
          quizDetail: form.quizDetail,
          categories,
          courseIds: courseIds.length > 0 ? courseIds : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Si rate limit, rafraîchit le quota pour mettre à jour le compteur live
        if (res.status === 429) {
          await loadQuota()
        }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      router.push(`/audits/${data.session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-col-20">
      <form onSubmit={handleSubmit} className="flex-col-20">
        {courseIds.length > 0 && (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--info-light, #E8F4FD)',
              border: '1px solid var(--brand)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              color: 'var(--text)',
            }}
          >
            <strong>Audit ciblé :</strong> {courseIds.length} cours pré-sélectionné(s) depuis « Mes cours ».
            L&apos;audit ne traitera que ces cours (au lieu de toute la plateforme).
          </div>
        )}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <AcademicCapIcon className="card-icon" /> Plateforme Moodle
            </span>
          </div>
          <div className="card-body">
            <div className="platform-list">
              {platforms.map(p => (
                <label
                  key={p.id}
                  className="platform-item"
                  style={{ cursor: 'pointer', borderColor: form.platformId === p.id ? 'var(--brand)' : undefined }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <input
                      type="radio"
                      name="platformId"
                      value={p.id}
                      checked={form.platformId === p.id}
                      onChange={() => setForm(f => ({ ...f, platformId: p.id }))}
                      style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
                    />
                    <div className="platform-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="platform-name">{p.name}</span>
                        <span className="badge badge-neutral">Moodle {p.version}.x</span>
                      </div>
                      <span className="platform-url">{p.url}</span>
                    </div>
                  </div>
                </label>
              ))}
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
            <div className="form-group">
              <select
                value={form.llmConfigId}
                onChange={e => setForm(f => ({ ...f, llmConfigId: e.target.value }))}
              >
                {llmConfigs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.provider}/{c.model}
                    {c.isDefault ? ' (défaut)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Cog6ToothIcon className="card-icon" /> Options d&apos;audit
            </span>
          </div>
          <div className="card-body">
            <div className="config-layout">
              <div className="form-group">
                <label className="form-label">Profondeur quiz</label>
                <select
                  value={form.quizDetail}
                  onChange={e =>
                    setForm(f => ({ ...f, quizDetail: e.target.value as 'meta' | 'detail' | 'both' }))
                  }
                >
                  <option value="meta">Méta uniquement (rapide)</option>
                  <option value="detail">Détail par étudiant</option>
                  <option value="both">Les deux (recommandé)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Analyse des images</label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    marginTop: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.extractImages}
                    onChange={e => setForm(f => ({ ...f, extractImages: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)', marginTop: 2 }}
                  />
                  <span style={{ fontSize: 13, lineHeight: 1.4 }}>
                    Analyser les images des cours (OCR bandeaux)
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {form.extractImages
                        ? 'Extrait nom enseignant / matière depuis les bandeaux de tête. Audit ~50 % plus lent.'
                        : '⚡ Audit accéléré (~30-50 %). Les noms d\'enseignants sur bandeaux ne seront pas récupérés.'}
                    </span>
                  </span>
                </label>
              </div>
              <div className="form-group full">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Filtre catégories (optionnel)</label>
                  {form.platformId && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => setCategoryPickerOpen(o => !o)}
                    >
                      <FolderIcon style={{ width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' }} />{' '}
                      {categoryPickerOpen ? 'Fermer l\'arbre' : 'Parcourir l\'arbre'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="ex: IDA, Licence 1, Master 2 (séparés par virgule)"
                  value={form.categoriesText}
                  onChange={e => setForm(f => ({ ...f, categoriesText: e.target.value }))}
                />
                <span className="form-hint">
                  Si vide : tous les cours visibles seront audités. Sinon, seuls les cours dont la
                  hiérarchie contient une catégorie listée. Utilisez « Parcourir l&apos;arbre » pour
                  sélectionner via la structure Moodle.
                </span>
                {categoryPickerOpen && form.platformId && (
                  <CategoryPickerPanel
                    platformId={form.platformId}
                    selectedNames={selectedCategoryNames}
                    onChange={names => {
                      setForm(f => ({
                        ...f,
                        categoriesText: Array.from(names).join(', '),
                      }))
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ShieldCheckIcon className="card-icon" /> Vérification pré-audit
            </span>
            <button
              type="button"
              onClick={runPreflight}
              disabled={preflight.status === 'running' || !form.platformId || !form.llmConfigId}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              <ArrowPathIcon
                style={{
                  width: 12,
                  height: 12,
                  animation: preflight.status === 'running' ? 'spin 1s linear infinite' : undefined,
                }}
              />{' '}
              Relancer
            </button>
          </div>
          <div className="card-body">
            <PreflightRow
              label="Plateforme Moodle"
              status={preflight.status}
              check={preflight.checks?.platform}
            />
            <PreflightRow
              label="Serveur LLM"
              status={preflight.status}
              check={preflight.checks?.llm}
            />
            <PreflightRow
              label="Modèle disponible"
              status={preflight.status}
              check={preflight.checks?.model}
            />
            {preflight.status === 'error' && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
                Erreur du preflight : {preflight.error}
              </div>
            )}
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {quota && quota.blocked && (
          <div
            className="error-banner"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <NoSymbolIcon style={ICON_INLINE} />{' '}
              {quota.blockedKind === 'user'
                ? `Vous avez atteint votre quota personnel (${quota.perUser.limit} audits / ${Math.round(
                    quota.perUser.windowSec / 60,
                  )} min).`
                : `Le quota global de la plateforme est saturé (${quota.global.limit} audits / ${Math.round(
                    quota.global.windowSec / 60,
                  )} min). D'autres auditeurs sont en cours.`}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
              Disponible dans {formatMmSs(countdown)}
            </span>
          </div>
        )}

        {quota && !quota.blocked && quota.nearLimit && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--warn-light)',
              border: '1px solid #F9E79F',
              color: 'var(--warn)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
            }}
          >
            <ExclamationTriangleIcon style={ICON_INLINE} />{' '}
            {quota.nearLimitKind === 'user'
              ? `Quota personnel : ${quota.perUser.used}/${quota.perUser.limit} audits utilisés sur la fenêtre de ${Math.round(
                  quota.perUser.windowSec / 60,
                )} min.`
              : `Quota global : ${quota.global.used}/${quota.global.limit} audits utilisés. La file est chargée par d'autres auditeurs.`}
          </div>
        )}

        <div className="card">
          <div
            className="card-body"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {isBlocked ? (
                <span>
                  Quota atteint — réessayez dans{' '}
                  <strong style={{ fontFamily: 'var(--mono)' }}>{formatMmSs(countdown)}</strong>.
                </span>
              ) : (
                <>Lancement asynchrone via la file d&apos;attente. Vous serez redirigé vers la page de suivi.</>
              )}
            </div>
            <button
              type="submit"
              className="btn-launch"
              disabled={
                submitting ||
                isBlocked ||
                !form.platformId ||
                !form.llmConfigId ||
                !preflight.ok
              }
              title={!preflight.ok ? 'La vérification pré-audit doit passer avant le lancement.' : undefined}
            >
              {submitting ? (
                'Création…'
              ) : isBlocked ? (
                <>
                  <ClockIcon style={ICON_INLINE} /> {formatMmSs(countdown)}
                </>
              ) : (
                <>
                  <PlayIcon style={ICON_INLINE} /> Lancer l&apos;audit
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

/**
 * Ligne d'un check pre-flight : icône d'état + libellé + message.
 * En state "idle" ou "running" on affiche un placeholder (spinner ou "…").
 */
function PreflightRow({
  label,
  status,
  check,
}: {
  label: string
  status: PreflightState['status']
  check?: PreflightCheck
}) {
  const isRunning = status === 'running'
  const done = status === 'done' && check
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      {isRunning ? (
        <ArrowPathIcon
          style={{ width: 16, height: 16, color: 'var(--text3)', animation: 'spin 1s linear infinite' }}
        />
      ) : done && check!.ok ? (
        <CheckCircleIcon style={{ width: 16, height: 16, color: 'var(--success)' }} />
      ) : done ? (
        <XCircleIcon style={{ width: 16, height: 16, color: 'var(--danger)' }} />
      ) : (
        <ClockIcon style={{ width: 16, height: 16, color: 'var(--text3)' }} />
      )}
      <strong style={{ minWidth: 140 }}>{label}</strong>
      <span style={{ color: done && !check!.ok ? 'var(--danger)' : 'var(--text2)', flex: 1 }}>
        {isRunning
          ? 'Vérification en cours…'
          : done
            ? check!.message
            : status === 'error'
              ? 'Non testé'
              : 'En attente'}
      </span>
      {done && check!.latencyMs > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          {check!.latencyMs}ms
        </span>
      )}
    </div>
  )
}

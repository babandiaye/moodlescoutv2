'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  LinkIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  PlayIcon,
  Squares2X2Icon,
  CheckCircleIcon,
  CpuChipIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  StarIcon,
  PencilSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

type Provider = 'ollama' | 'anthropic'

export type LlmConfig = {
  id: string
  name: string
  provider: Provider | string
  apiUrl: string | null
  model: string
  isDefault: boolean
  isActive: boolean
  createdAt?: string
}

type Props = {
  initial: LlmConfig[]
}

type TestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; latencyMs: number; sitename?: string; release?: string; modelsCount?: number; modelPresent?: boolean; model?: string }
  | { status: 'error'; error: string }

type ModelsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; list: string[] }
  | { status: 'error'; error: string }

const PAGE_SIZE = 10

/**
 * Vue master-detail pour la gestion des configurations LLM.
 * Colonne gauche : liste filtrable (recherche + statut) + pagination locale.
 * Colonne droite : formulaire d'édition inline + actions (Tester, Explorer,
 * Désactiver/Activer, Supprimer).
 */
export function LlmConfigsMasterDetail({ initial }: Props) {
  const router = useRouter()
  const [configs, setConfigs] = useState<LlmConfig[]>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return configs.filter(c => {
      if (statusFilter === 'active' && !c.isActive) return false
      if (statusFilter === 'inactive' && c.isActive) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        String(c.provider).toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        (c.apiUrl ?? '').toLowerCase().includes(q)
      )
    })
  }, [configs, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selected = configs.find(c => c.id === selectedId) ?? null

  const upsertLocal = (c: LlmConfig) => setConfigs(list => list.map(x => (x.id === c.id ? c : x)))

  const removeLocal = (id: string) => setConfigs(list => list.filter(x => x.id !== id))

  const showBanner = (kind: 'ok' | 'err', msg: string) => {
    setBanner({ kind, msg })
    setTimeout(() => setBanner(null), 4500)
  }

  return (
    <>
      {banner && (
        <div className={banner.kind === 'ok' ? 'success-banner' : 'error-banner'}>
          {banner.kind === 'ok' ? <CheckCircleIcon width={16} height={16} /> : null}
          {banner.msg}
        </div>
      )}

      <div className="master-detail">
        {/* ═══ Colonne gauche : liste ═══ */}
        <div className="list-panel">
          <div className="list-panel-header">
            <div className="list-panel-title-row">
              <div>
                <div className="list-panel-title">Configurations LLM</div>
                <div className="list-panel-subtitle">Gérez vos modèles et fournisseurs IA</div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreate(true)}
                style={{ padding: '9px 16px' }}
              >
                <PlusIcon width={14} height={14} /> Ajouter
              </button>
            </div>
          </div>

          <div className="list-panel-filters">
            <div className="list-panel-search">
              <MagnifyingGlassIcon className="list-panel-search-icon" />
              <input
                type="search"
                placeholder="Rechercher une configuration…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setPage(1) }}
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actives</option>
              <option value="inactive">Désactivées</option>
            </select>
          </div>

          <div className="list-panel-count">
            {filtered.length} configuration{filtered.length > 1 ? 's' : ''}
          </div>

          <div className="list-panel-items">
            {pageItems.length === 0 ? (
              <div className="empty-state">Aucune configuration.</div>
            ) : (
              pageItems.map(c => (
                <ListItem
                  key={c.id}
                  config={c}
                  selected={selectedId === c.id}
                  onClick={() => setSelectedId(c.id)}
                />
              ))
            )}
          </div>

          <div className="list-panel-footer">
            <span>
              {filtered.length > 0
                ? `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filtered.length)} sur ${filtered.length}`
                : '0'}
            </span>
            <div className="pagination-nav">
              <button
                type="button"
                className="pag-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Précédent"
              >
                <ChevronLeftIcon width={14} height={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(n => (
                <button
                  key={n}
                  type="button"
                  className={`pag-btn ${n === currentPage ? 'active' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="pag-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Suivant"
              >
                <ChevronRightIcon width={14} height={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Colonne droite : détails ═══ */}
        <div className="detail-panel-v2">
          {selected ? (
            <DetailPanel
              config={selected}
              onUpdated={upsertLocal}
              onDeleted={id => {
                removeLocal(id)
                setSelectedId(configs.find(c => c.id !== id)?.id ?? null)
                router.refresh()
              }}
              onBanner={showBanner}
              router={router}
            />
          ) : (
            <div className="detail-panel-empty">
              <Cog6ToothIcon className="detail-panel-empty-icon" />
              <div>Sélectionnez une configuration à gauche pour voir ses détails.</div>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={created => {
            setConfigs(list => [created, ...(created.isDefault ? list.map(x => ({ ...x, isDefault: false })) : list)])
            setSelectedId(created.id)
            setShowCreate(false)
            showBanner('ok', `Configuration « ${created.name} » créée.`)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function ListItem({ config, selected, onClick }: { config: LlmConfig; selected: boolean; onClick: () => void }) {
  return (
    <div className={`list-item ${selected ? 'selected' : ''}`} onClick={onClick}>
      <input type="checkbox" className="list-item-check" onClick={e => e.stopPropagation()} readOnly checked={selected} />
      <div className="list-item-body">
        <div className="list-item-title-row">
          <span className="list-item-title">{config.name}</span>
          <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
            {config.provider}
          </span>
          {config.isDefault && (
            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <StarIcon width={10} height={10} /> Défaut
            </span>
          )}
        </div>
        <div className="list-item-sub">
          {config.model || config.apiUrl || '—'}
        </div>
      </div>
      <span className={`list-item-status ${config.isActive ? 'active' : 'inactive'}`}>
        <span className="dot" />
        {config.isActive ? 'Active' : 'Désactivée'}
      </span>
    </div>
  )
}

function DetailPanel({
  config,
  onUpdated,
  onDeleted,
  onBanner,
  router,
}: {
  config: LlmConfig
  onUpdated: (c: LlmConfig) => void
  onDeleted: (id: string) => void
  onBanner: (kind: 'ok' | 'err', msg: string) => void
  router: ReturnType<typeof useRouter>
}) {
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [models, setModels] = useState<ModelsState>({ status: 'idle' })
  const [showModels, setShowModels] = useState(false)
  const [editing, setEditing] = useState<null | 'name' | 'apiUrl' | 'model' | 'apiKey'>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [busy, setBusy] = useState(false)

  const handlePatch = async (data: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      onUpdated(d.config as LlmConfig)
      onBanner('ok', 'Configuration mise à jour.')
      router.refresh()
    } catch (e) {
      onBanner('err', (e as Error).message)
    } finally {
      setBusy(false)
      setEditing(null)
    }
  }

  const handleTest = async () => {
    setTest({ status: 'loading' })
    try {
      const res = await fetch(`/api/llm-configs/${config.id}/test`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok && !('ok' in d)) {
        setTest({ status: 'error', error: d.error ?? `HTTP ${res.status}` })
        return
      }
      if (d.ok) {
        setTest({
          status: 'ok',
          latencyMs: d.latencyMs ?? 0,
          modelsCount: d.modelsCount,
          modelPresent: d.configuredModelAvailable,
          model: d.configuredModel,
        })
      } else {
        setTest({ status: 'error', error: d.error ?? 'Test échoué' })
      }
    } catch (e) {
      setTest({ status: 'error', error: (e as Error).message })
    }
  }

  const handleExplore = async () => {
    setShowModels(true)
    if (models.status === 'ready') return
    setModels({ status: 'loading' })
    try {
      const res = await fetch(`/api/llm-configs/${config.id}/models`)
      const d = await res.json()
      if (!res.ok) {
        setModels({ status: 'error', error: d.error ?? `HTTP ${res.status}` })
        return
      }
      setModels({ status: 'ready', list: d.models ?? [] })
    } catch (e) {
      setModels({ status: 'error', error: (e as Error).message })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer la configuration « ${config.name} » ?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/llm-configs/${config.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      onDeleted(config.id)
      onBanner('ok', 'Configuration supprimée.')
    } catch (e) {
      onBanner('err', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="detail-panel-header">
        <div className="detail-panel-header-left">
          <div className="detail-panel-title">
            <Cog6ToothIcon className="detail-panel-title-icon" />
            Détails de la configuration
          </div>
          <span className={`list-item-status ${config.isActive ? 'active' : 'inactive'}`}>
            <span className="dot" /> {config.isActive ? 'Active' : 'Désactivée'}
          </span>
        </div>
        <div className="detail-panel-actions">
          <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={test.status === 'loading' || busy}>
            <PlayIcon width={14} height={14} /> {test.status === 'loading' ? 'Test…' : 'Tester'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExplore} disabled={busy}>
            <Squares2X2Icon width={14} height={14} /> Explorer
          </button>
          <button
            type="button"
            className={config.isActive ? 'btn btn-secondary' : 'btn btn-success'}
            onClick={() => handlePatch({ isActive: !config.isActive })}
            disabled={busy}
          >
            {config.isActive ? 'Désactiver' : 'Activer'}
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
            <TrashIcon width={14} height={14} /> Supprimer
          </button>
        </div>
      </div>

      {test.status !== 'idle' && test.status !== 'loading' && (
        <div style={{ padding: '0 22px', marginTop: 12 }}>
          {test.status === 'ok' ? (
            <div className="success-banner" style={{ marginBottom: 0 }}>
              <CheckCircleIcon width={16} height={16} />
              Connexion OK en {test.latencyMs} ms
              {test.modelsCount !== undefined && ` — ${test.modelsCount} modèle(s) disponibles`}
              {test.modelPresent !== undefined && !test.modelPresent && (
                <span style={{ marginLeft: 6, color: 'var(--warn)' }}>
                  · Modèle configuré ABSENT
                </span>
              )}
            </div>
          ) : (
            <div className="error-banner" style={{ marginBottom: 0 }}>{test.error}</div>
          )}
        </div>
      )}

      <div className="detail-panel-body">
        {/* Card Infos générales */}
        <div className="detail-card">
          <div className="detail-card-header">
            <InformationCircleIcon /> Informations générales
          </div>
          <div className="detail-card-body">
            <div className="detail-info-grid">
              <EditableField
                label="Nom"
                required
                value={config.name}
                editing={editing === 'name'}
                onEdit={() => setEditing('name')}
                onSave={v => handlePatch({ name: v })}
                onCancel={() => setEditing(null)}
              />
              <EditableField
                label="URL"
                value={config.apiUrl ?? ''}
                mono
                editing={editing === 'apiUrl'}
                onEdit={() => setEditing('apiUrl')}
                onSave={v => handlePatch({ apiUrl: v || null })}
                onCancel={() => setEditing(null)}
                type="url"
              />
              <ReadOnlyField label="Fournisseur" value={
                <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{config.provider}</span>
              } />
              <ReadOnlyField label="Statut" value={
                <span className={`list-item-status ${config.isActive ? 'active' : 'inactive'}`}>
                  <span className="dot" /> {config.isActive ? 'Active' : 'Désactivée'}
                </span>
              } />
              <EditableModelField
                configId={config.id}
                value={config.model}
                editing={editing === 'model'}
                onEdit={() => setEditing('model')}
                onSave={v => handlePatch({ model: v })}
                onCancel={() => setEditing(null)}
              />
              <ReadOnlyField
                label="Créée le"
                value={config.createdAt ? new Date(config.createdAt).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }) : '—'}
              />
              <ReadOnlyField
                label="Par défaut"
                value={
                  config.isDefault
                    ? <span className="badge badge-info"><StarIcon width={10} height={10} style={{ marginRight: 3 }} /> Oui</span>
                    : (
                      <button
                        type="button"
                        className="api-key-edit-btn"
                        onClick={() => handlePatch({ isDefault: true })}
                      >
                        Définir comme défaut
                      </button>
                    )
                }
              />
            </div>
          </div>
        </div>

        {/* Card Clé API */}
        <div className="detail-card">
          <div className="detail-card-header">
            <LinkIcon /> Clé API
          </div>
          <div className="detail-card-body">
            <div className="detail-field-label" style={{ marginBottom: 6 }}>
              Bearer token {config.provider}
            </div>
            {editing === 'apiKey' ? (
              <NewApiKeyForm
                onSave={v => handlePatch({ apiKey: v })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="api-key-input">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    readOnly
                    value={`${config.provider === 'anthropic' ? 'sk-ant-' : 'sk-ollama-'}${'•'.repeat(40)}`}
                    aria-label="Clé API (masquée)"
                  />
                  <button
                    type="button"
                    className="api-key-input-toggle"
                    onClick={() => setShowApiKey(v => !v)}
                    aria-label={showApiKey ? 'Masquer' : 'Afficher'}
                  >
                    {showApiKey ? <EyeSlashIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
                  </button>
                </div>
                <div className="api-key-hint">Stockée chiffrée (AES-256-GCM) en base.</div>
                <button
                  type="button"
                  className="api-key-edit-btn"
                  onClick={() => setEditing('apiKey')}
                >
                  <PencilSquareIcon width={12} height={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Modifier la clé
                </button>
              </>
            )}
          </div>
        </div>

        {/* Card Détails avancés — valeurs système, read-only */}
        <div className="detail-card">
          <div className="detail-card-header">
            <Cog6ToothIcon /> Détails avancés
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>
              Valeurs par défaut système
            </span>
          </div>
          <div className="detail-card-body">
            <div className="detail-info-grid">
              <ReadOnlyField label="Timeout" value="180 s" />
              <ReadOnlyField label="Top P" value="1.0" />
              <ReadOnlyField label="Température" value="0.1" />
              <ReadOnlyField label="Retry maxi" value="2" />
              <ReadOnlyField
                label="Tokens max"
                value={config.provider === 'anthropic' ? '3 000' : '2 500'}
              />
              <ReadOnlyField label="Concurrence LLM" value="Redis semaphore" />
            </div>
          </div>
        </div>

        {/* Modèles disponibles (accordéon) */}
        {showModels && (
          <div className="detail-card">
            <div className="detail-card-header">
              <CpuChipIcon /> Modèles disponibles
              <button
                type="button"
                onClick={() => setShowModels(false)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              >
                Fermer
              </button>
            </div>
            <div className="detail-card-body">
              {models.status === 'loading' && <div style={{ fontSize: 13, color: 'var(--text3)' }}>Chargement…</div>}
              {models.status === 'error' && <div className="error-banner" style={{ margin: 0 }}>{models.error}</div>}
              {models.status === 'ready' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {models.list.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--text3)' }}>Aucun modèle listé.</span>
                  ) : (
                    models.list.map(m => (
                      <span
                        key={m}
                        className={`badge ${m === config.model ? 'badge-info' : 'badge-neutral'}`}
                        style={{ fontFamily: 'var(--mono)', fontSize: 11 }}
                      >
                        {m}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Widgets utilitaires ─────────────────────────────────────

function EditableField({
  label,
  required,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
  mono,
  type = 'text',
}: {
  label: string
  required?: boolean
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (v: string) => void
  onCancel: () => void
  mono?: boolean
  type?: string
}) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="detail-field">
      <div className="detail-field-label">
        {label}{required && <span className="req">*</span>}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') onSave(draft)
              if (e.key === 'Escape') onCancel()
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '6px 10px', fontSize: 12 }}
            onClick={() => onSave(draft)}
          >
            OK
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: 12 }}
            onClick={onCancel}
          >
            ×
          </button>
        </div>
      ) : (
        <div
          className={`detail-field-value ${mono ? 'mono' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={onEdit}
          title="Cliquez pour modifier"
        >
          {value || <span style={{ color: 'var(--text3)' }}>Cliquez pour définir…</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Champ "Modèle" avec dropdown des modèles disponibles côté LLM (fetch au
 * moment de l'édition, cache tant qu'on reste sur la config). Bascule libre
 * vers un input texte pour saisir un modèle personnalisé (fine-tune, alias,
 * modèle non listé). Si l'API modèles échoue (URL/clé manquante côté config
 * pas encore configurée), on retombe automatiquement en saisie manuelle.
 */
function EditableModelField({
  configId,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  configId: string
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; list: string[] }
    | { status: 'error'; error: string }
  >({ status: 'idle' })
  const [customMode, setCustomMode] = useState(false)

  const load = async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch(`/api/llm-configs/${configId}/models`)
      const d = await res.json()
      if (!res.ok) {
        setState({ status: 'error', error: d.error ?? `HTTP ${res.status}` })
        return
      }
      setState({ status: 'ready', list: Array.isArray(d.models) ? d.models : [] })
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message })
    }
  }

  // Reset le draft quand on rentre en édition, et déclenche le fetch une fois.
  useEffect(() => {
    if (!editing) return
    setDraft(value)
    setCustomMode(false)
    if (state.status === 'idle') load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing) {
    return (
      <div className="detail-field">
        <div className="detail-field-label">Modèle</div>
        <div
          className="detail-field-value mono"
          style={{ cursor: 'pointer' }}
          onClick={onEdit}
          title="Cliquez pour choisir un modèle"
        >
          {value || <span style={{ color: 'var(--text3)' }}>Cliquez pour définir…</span>}
        </div>
      </div>
    )
  }

  const list = state.status === 'ready' ? state.list : []
  // On garde toujours la valeur actuelle sélectionnable, même si l'API ne la renvoie pas
  const displayList = draft && !list.includes(draft) ? [draft, ...list] : list
  const useSelect = !customMode && state.status === 'ready' && list.length > 0

  return (
    <div className="detail-field">
      <div className="detail-field-label">Modèle</div>

      {state.status === 'error' && (
        <div
          className="error-banner"
          style={{ marginBottom: 8, fontSize: 11, padding: '6px 10px' }}
        >
          Liste indisponible : {state.error}. Saisissez le nom du modèle manuellement.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {state.status === 'loading' ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 0' }}>
            Chargement des modèles…
          </div>
        ) : useSelect ? (
          <select
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ minWidth: 260, flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5 }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') onSave(draft)
              if (e.key === 'Escape') onCancel()
            }}
          >
            {displayList.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            placeholder="Nom exact du modèle (ex. qwen3:8b)"
            style={{ minWidth: 260, flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5 }}
            onKeyDown={e => {
              if (e.key === 'Enter') onSave(draft)
              if (e.key === 'Escape') onCancel()
            }}
          />
        )}

        {state.status === 'ready' && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 8px', fontSize: 11 }}
            onClick={() => setCustomMode(c => !c)}
            title={customMode ? 'Choisir dans la liste' : 'Saisir un modèle personnalisé'}
          >
            {customMode ? 'Liste' : 'Perso.'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 8px', fontSize: 11 }}
          onClick={load}
          disabled={state.status === 'loading'}
          title="Rafraîchir la liste depuis le fournisseur"
        >
          <ArrowPathIcon width={12} height={12} />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '6px 10px', fontSize: 12 }}
          onClick={() => onSave(draft)}
          disabled={!draft || draft === value}
        >
          OK
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 10px', fontSize: 12 }}
          onClick={onCancel}
        >
          ×
        </button>
      </div>

      {state.status === 'ready' && list.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          {list.length} modèle{list.length > 1 ? 's' : ''} disponible{list.length > 1 ? 's' : ''}
          {draft && !list.includes(draft) && ' · valeur actuelle non listée (sera envoyée telle quelle)'}
        </div>
      )}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-field">
      <div className="detail-field-label">{label}</div>
      <div className="detail-field-value">{value}</div>
    </div>
  )
}

function NewApiKeyForm({ onSave, onCancel }: { onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('')
  return (
    <div>
      <input
        type="text"
        value={v}
        onChange={e => setV(e.target.value)}
        placeholder="Coller ici la nouvelle clé…"
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12.5,
          padding: '9px 12px',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          width: '100%',
        }}
        autoFocus
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => v.length >= 8 && onSave(v)}
          disabled={v.length < 8}
          style={{ padding: '8px 14px', fontSize: 12 }}
        >
          Enregistrer
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          style={{ padding: '8px 14px', fontSize: 12 }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Modal création ──────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: LlmConfig) => void
}) {
  const [form, setForm] = useState({
    name: '',
    provider: 'ollama' as Provider,
    apiUrl: '',
    apiKey: '',
    model: 'gemma3:12b',
    isDefault: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/llm-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      onCreated(d.config as LlmConfig)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,30,61,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 200, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14,
          padding: 24, maxWidth: 480, width: '100%',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 6 }}>
          Nouvelle configuration LLM
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Ajoutez un fournisseur IA (Ollama souverain ou Anthropic Claude).
        </p>

        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="form-label">Fournisseur</div>
            <div className="provider-grid">
              <div
                className={`provider-card ${form.provider === 'ollama' ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, provider: 'ollama' }))}
              >
                <div className="provider-card-title">Ollama</div>
                <div className="provider-card-sub">Souverain (UN-CHK)</div>
              </div>
              <div
                className={`provider-card ${form.provider === 'anthropic' ? 'active' : ''}`}
                onClick={() => setForm(f => ({ ...f, provider: 'anthropic' }))}
              >
                <div className="provider-card-title">Anthropic</div>
                <div className="provider-card-sub">Claude API</div>
              </div>
            </div>
          </div>
          <div>
            <div className="form-label">Nom</div>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ollama Fromager…" />
          </div>
          {form.provider === 'ollama' && (
            <div>
              <div className="form-label">URL Ollama</div>
              <input value={form.apiUrl} onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))} placeholder="https://fromager.unchk.sn" />
            </div>
          )}
          <div>
            <div className="form-label">Clé API {form.provider === 'ollama' && '(optionnel)'}</div>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder={form.provider === 'anthropic' ? 'sk-ant-…' : 'Bearer token…'}
            />
          </div>
          <div>
            <div className="form-label">Modèle</div>
            <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
            />
            Définir comme configuration par défaut
          </label>
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting || !form.name || (form.provider === 'ollama' && !form.apiUrl) || (form.provider === 'anthropic' && !form.apiKey)}
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

type Provider = 'ollama' | 'anthropic' | 'openai'
type Scope = 'shared' | 'personal'
type Role = 'admin' | 'enseignant' | 'lecteur'

export type LlmConfig = {
  id: string
  name: string
  provider: Provider | string
  apiUrl: string | null
  model: string
  scope: Scope
  userId: string | null
  isDefault: boolean
  isActive: boolean
  createdAt?: string
}

type Props = {
  initial: LlmConfig[]
  currentUserId: string
  currentUserRole: Role
  /** ID du LLM par défaut de l'utilisateur courant, ou null. */
  myDefaultLlmConfigId: string | null
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
export function LlmConfigsMasterDetail({
  initial,
  currentUserId,
  currentUserRole,
  myDefaultLlmConfigId: initialMyDefault,
}: Props) {
  const router = useRouter()
  const [configs, setConfigs] = useState<LlmConfig[]>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [myDefaultId, setMyDefaultId] = useState<string | null>(initialMyDefault)
  const [savingDefault, setSavingDefault] = useState(false)

  const isAdmin = currentUserRole === 'admin'

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

  /**
   * Change le défaut personnel du user via PUT /api/me/default-llm.
   * L'API valide côté serveur que la config est visible + active.
   */
  const changeMyDefault = async (llmConfigId: string | null) => {
    setSavingDefault(true)
    try {
      const res = await fetch('/api/me/default-llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmConfigId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      setMyDefaultId(llmConfigId)
      const name = configs.find(c => c.id === llmConfigId)?.name
      showBanner('ok', llmConfigId
        ? `Défaut mis à jour : ${name ?? 'inconnu'}`
        : 'Défaut réinitialisé sur Ollama-UNCHK partagé')
      router.refresh()
    } catch (e) {
      showBanner('err', (e as Error).message)
    } finally {
      setSavingDefault(false)
    }
  }

  // Options du dropdown défaut : uniquement les configs ACTIVES visibles.
  // Les inactives ne peuvent pas être "défaut" (l'API refuserait).
  const defaultOptions = configs.filter(c => c.isActive)

  return (
    <>
      {banner && (
        <div className={banner.kind === 'ok' ? 'success-banner' : 'error-banner'}>
          {banner.kind === 'ok' ? <CheckCircleIcon width={16} height={16} /> : null}
          {banner.msg}
        </div>
      )}

      {/* Card "Mon LLM par défaut" — visible pour tous les rôles */}
      <div className="my-default-llm-card">
        <div className="my-default-llm-card-body">
          <div className="my-default-llm-icon">
            <StarIcon width={20} height={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="my-default-llm-label">Mon LLM par défaut</div>
            <div className="my-default-llm-sub">
              Utilisé automatiquement pour vos audits (sauf choix explicite au lancement).
            </div>
          </div>
          <select
            className="my-default-llm-select"
            value={myDefaultId ?? ''}
            onChange={e => changeMyDefault(e.target.value || null)}
            disabled={savingDefault}
          >
            <option value="">— Fallback Ollama-UNCHK partagé —</option>
            {defaultOptions.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.provider}/{c.model}){c.scope === 'shared' ? ' · partagé' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

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
                  isMyDefault={myDefaultId === c.id}
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
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
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
          isAdmin={isAdmin}
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

function ListItem({
  config,
  selected,
  onClick,
  isMyDefault,
}: {
  config: LlmConfig
  selected: boolean
  onClick: () => void
  isMyDefault?: boolean
}) {
  return (
    <div className={`list-item ${selected ? 'selected' : ''}`} onClick={onClick}>
      <input type="checkbox" className="list-item-check" onClick={e => e.stopPropagation()} readOnly checked={selected} />
      <div className="list-item-body">
        <div className="list-item-title-row">
          <span className="list-item-title">{config.name}</span>
          <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
            {config.provider}
          </span>
          {/* Badge scope : "Partagé" (bleu clair) ou "Perso" (violet clair) */}
          <span
            className={`badge ${config.scope === 'shared' ? 'badge-info' : 'badge-neutral'}`}
            style={{ fontSize: 10 }}
            title={config.scope === 'shared' ? 'Config partagée (DITSI)' : 'Config personnelle (invisible aux autres)'}
          >
            {config.scope === 'shared' ? 'Partagé' : 'Perso'}
          </span>
          {config.isDefault && (
            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <StarIcon width={10} height={10} /> Défaut d'usine
            </span>
          )}
          {isMyDefault && !config.isDefault && (
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <StarIcon width={10} height={10} /> Mon défaut
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
  currentUserId,
  currentUserRole,
  onUpdated,
  onDeleted,
  onBanner,
  router,
}: {
  config: LlmConfig
  currentUserId: string
  currentUserRole: Role
  onUpdated: (c: LlmConfig) => void
  onDeleted: (id: string) => void
  onBanner: (kind: 'ok' | 'err', msg: string) => void
  router: ReturnType<typeof useRouter>
}) {
  // ─── Règles d'action côté UI (miroir de lib/llm-access.ts côté serveur)
  // Verrouille visuellement les actions sur les configs que l'user ne peut
  // pas modifier — au lieu d'afficher un bouton qui renvoie 403 au clic.
  const isConfigAdmin = currentUserRole === 'admin'
  const isMine = config.scope === 'personal' && config.userId === currentUserId
  const canEdit = config.scope === 'shared' ? isConfigAdmin : isMine
  // Le défaut d'usine actif (Ollama-UNCHK) est verrouillé : ni désactivation
  // ni suppression, même par admin — sinon on casserait le fallback qui sert
  // à tous les users. L'admin doit d'abord marquer une AUTRE config partagée
  // comme défaut avant de pouvoir la retirer.
  const isProtectedFactoryDefault = config.scope === 'shared' && config.isDefault && config.isActive
  const canToggleActive = canEdit && !isProtectedFactoryDefault
  const canDelete = canEdit && !isProtectedFactoryDefault
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
          {canToggleActive && (
            <button
              type="button"
              className={config.isActive ? 'btn btn-secondary' : 'btn btn-success'}
              onClick={() => handlePatch({ isActive: !config.isActive })}
              disabled={busy}
            >
              {config.isActive ? 'Désactiver' : 'Activer'}
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
              <TrashIcon width={14} height={14} /> Supprimer
            </button>
          )}
          {isProtectedFactoryDefault && (
            <span
              className="badge badge-warn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', fontSize: 12, fontWeight: 500,
              }}
              title="Configuration verrouillée : c'est le défaut d'usine actif utilisé par tous les utilisateurs. Pour la modifier, désignez d'abord une autre config partagée comme défaut."
            >
              🔒 Verrouillé (défaut d'usine)
            </span>
          )}
          {!canEdit && !isProtectedFactoryDefault && (
            <span
              style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center', marginLeft: 4 }}
              title="Cette configuration est partagée par la DITSI — vous pouvez la tester mais pas la modifier."
            >
              🔒 Lecture seule
            </span>
          )}
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
                editing={editing === 'model' && canEdit}
                onEdit={() => canEdit && setEditing('model')}
                onSave={v => handlePatch({ model: v })}
                onCancel={() => setEditing(null)}
                // Politique DITSI : les configs Ollama partagées ne peuvent
                // proposer que des modèles gemma3* (les autres modèles hébergés
                // sur fromager sont pour d'autres usages ; forcer ici évite
                // qu'on bascule accidentellement UNCHK sur mistral ou qwen).
                modelFilter={
                  config.scope === 'shared' && config.provider === 'ollama'
                    ? (m: string) => /^gemma3/i.test(m)
                    : undefined
                }
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
  modelFilter,
}: {
  configId: string
  value: string
  editing: boolean
  onEdit: () => void
  onSave: (v: string) => void
  onCancel: () => void
  /**
   * Filtre optionnel appliqué à la liste des modèles retournée par l'API.
   * Ex : `(m) => /^gemma3/i.test(m)` pour restreindre un Ollama partagé à
   * la famille gemma3 (politique DITSI).
   */
  modelFilter?: (model: string) => boolean
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
      const raw: string[] = Array.isArray(d.models) ? d.models : []
      const filtered = modelFilter ? raw.filter(modelFilter) : raw
      setState({ status: 'ready', list: filtered })
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

/**
 * Filtre imposé selon la portée + provider :
 *  - Ollama shared (infra UN-CHK) : uniquement modèles gemma3* (politique DITSI)
 *  - OpenAI : on filtre déjà côté listOpenaiModels (gpt-* vision-capable)
 *  - Anthropic : liste complète telle que renvoyée par l'API
 */
function filterModelsForPolicy(
  provider: Provider,
  scope: Scope,
  models: string[],
): string[] {
  if (provider === 'ollama' && scope === 'shared') {
    return models.filter(m => /^gemma3/i.test(m))
  }
  return models
}

function CreateModal({
  isAdmin,
  onClose,
  onCreated,
}: {
  isAdmin: boolean
  onClose: () => void
  onCreated: (c: LlmConfig) => void
}) {
  // Scope par défaut : personal (le comportement standard pour un enseignant).
  const [form, setForm] = useState({
    name: '',
    provider: 'anthropic' as Provider,
    apiUrl: '',
    apiKey: '',
    model: '',
    scope: 'personal' as Scope,
    isDefault: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // État du test : "idle" avant test, "testing" pendant, "ready" après (modèles chargés).
  // Toute modif de provider/URL/clé/scope réinitialise le test — impossible de créer
  // sans avoir passé un test valide (garantit le modèle correct).
  const [testState, setTestState] = useState<
    | { status: 'idle' }
    | { status: 'testing' }
    | { status: 'ready'; models: string[]; testedAt: number }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  const resetTest = () => setTestState({ status: 'idle' })

  const isTestable =
    (form.provider === 'ollama' && !!form.apiUrl) ||
    (form.provider === 'anthropic' && !!form.apiKey) ||
    (form.provider === 'openai' && !!form.apiKey)

  const runTest = async () => {
    setTestState({ status: 'testing' })
    try {
      const res = await fetch('/api/llm-configs/probe-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          apiUrl: form.apiUrl || null,
          apiKey: form.apiKey || null,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) {
        setTestState({ status: 'error', message: d.error ?? `HTTP ${res.status}` })
        return
      }
      const models: string[] = Array.isArray(d.models) ? d.models : []
      const filtered = filterModelsForPolicy(form.provider, form.scope, models)
      if (filtered.length === 0) {
        setTestState({
          status: 'error',
          message:
            form.provider === 'ollama' && form.scope === 'shared'
              ? 'Aucun modèle gemma3* trouvé sur cet Ollama. Une config partagée UN-CHK doit exposer un modèle gemma3 (politique DITSI).'
              : 'Le test a réussi mais aucun modèle n\'a été retourné par le fournisseur.',
        })
        return
      }
      setTestState({ status: 'ready', models: filtered, testedAt: Date.now() })
      // Pré-sélectionne le 1er modèle si le champ est vide ou plus dans la liste
      setForm(f => ({
        ...f,
        model: filtered.includes(f.model) ? f.model : filtered[0],
      }))
    } catch (e) {
      setTestState({ status: 'error', message: (e as Error).message })
    }
  }

  const submit = async () => {
    if (testState.status !== 'ready') return
    setSubmitting(true)
    setError(null)
    try {
      // Normalise les champs optionnels : "" → null pour éviter que Zod .url()
      // rejette une chaîne vide côté serveur (cas Anthropic sans apiUrl).
      const payload = {
        ...form,
        apiUrl: form.apiUrl || null,
        apiKey: form.apiKey || null,
      }
      const res = await fetch('/api/llm-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        className="llm-create-modal"
        style={{
          background: 'var(--surface)', borderRadius: 14,
          padding: 24, maxWidth: 520, width: '100%',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 6 }}>
          Nouveau fournisseur IA
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          {isAdmin
            ? 'Ajoutez une config partagée (visible par tous) ou perso (visible par vous seul).'
            : 'Ajoutez votre propre fournisseur IA. Il ne sera visible que par vous.'}
        </p>

        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Portée — visible pour admin uniquement */}
          {isAdmin && (
            <div>
              <div className="form-label">Portée</div>
              <div className="provider-grid">
                <div
                  className={`provider-card ${form.scope === 'shared' ? 'active' : ''}`}
                  onClick={() => { setForm(f => ({ ...f, scope: 'shared' })); resetTest() }}
                >
                  <div className="provider-card-title">Partagée</div>
                  <div className="provider-card-sub">Visible par tous</div>
                </div>
                <div
                  className={`provider-card ${form.scope === 'personal' ? 'active' : ''}`}
                  onClick={() => { setForm(f => ({ ...f, scope: 'personal', isDefault: false })); resetTest() }}
                >
                  <div className="provider-card-title">Personnelle</div>
                  <div className="provider-card-sub">Vous seul</div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="form-label">Fournisseur</div>
            {/* 3 cartes : Anthropic + OpenAI côté perso, Ollama réservé au partagé
                (l'auto-hébergé n'a de sens que pour la DITSI qui gère fromager). */}
            <div className="provider-grid provider-grid-3">
              <div
                className={`provider-card ${form.provider === 'anthropic' ? 'active' : ''}`}
                onClick={() => { setForm(f => ({ ...f, provider: 'anthropic', model: '' })); resetTest() }}
              >
                <div className="provider-card-title">Anthropic</div>
                <div className="provider-card-sub">Claude API</div>
              </div>
              <div
                className={`provider-card ${form.provider === 'openai' ? 'active' : ''}`}
                onClick={() => { setForm(f => ({ ...f, provider: 'openai', model: '' })); resetTest() }}
              >
                <div className="provider-card-title">OpenAI</div>
                <div className="provider-card-sub">ChatGPT API</div>
              </div>
              <div
                className={`provider-card ${form.provider === 'ollama' ? 'active' : ''}`}
                onClick={() => { setForm(f => ({ ...f, provider: 'ollama', model: '' })); resetTest() }}
              >
                <div className="provider-card-title">Ollama</div>
                <div className="provider-card-sub">Auto-hébergé</div>
              </div>
            </div>
          </div>

          <div className="form-group llm-modal-field">
            <div className="form-label">Nom</div>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={
                form.provider === 'ollama'
                  ? 'Ollama Fromager, Ollama Perso…'
                  : form.provider === 'openai'
                    ? 'Ma clé OpenAI, ChatGPT Perso…'
                    : 'Ma clé Anthropic, Claude Perso…'
              }
            />
          </div>

          {form.provider === 'ollama' && (
            <div className="form-group llm-modal-field">
              <div className="form-label">URL Ollama</div>
              <input
                value={form.apiUrl}
                onChange={e => { setForm(f => ({ ...f, apiUrl: e.target.value })); resetTest() }}
                placeholder="https://fromager.unchk.sn"
              />
            </div>
          )}

          <div className="form-group llm-modal-field">
            <div className="form-label">
              Clé API {form.provider === 'ollama' && <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>}
            </div>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => { setForm(f => ({ ...f, apiKey: e.target.value })); resetTest() }}
              placeholder={
                form.provider === 'anthropic'
                  ? 'sk-ant-…'
                  : form.provider === 'openai'
                    ? 'sk-proj-… ou sk-…'
                    : 'Bearer token…'
              }
            />
          </div>

          {/* Bouton Tester + résultat */}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={runTest}
              disabled={!isTestable || testState.status === 'testing'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <PlayIcon width={14} height={14} />
              {testState.status === 'testing'
                ? 'Test en cours…'
                : testState.status === 'ready'
                  ? `✓ Connexion OK — ${testState.models.length} modèle${testState.models.length > 1 ? 's' : ''} disponible${testState.models.length > 1 ? 's' : ''}`
                  : 'Tester la connexion'}
            </button>
            {testState.status === 'error' && (
              <div className="error-banner" style={{ marginTop: 8, fontSize: 12 }}>
                {testState.message}
              </div>
            )}
            {form.provider === 'ollama' && form.scope === 'shared' && testState.status !== 'error' && (
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginBottom: 0 }}>
                <strong>Politique DITSI</strong> : seuls les modèles <code>gemma3*</code> sont autorisés pour un Ollama partagé.
              </p>
            )}
          </div>

          {/* Dropdown modèles — affiché UNIQUEMENT après un test réussi */}
          {testState.status === 'ready' && (
            <div className="form-group llm-modal-field">
              <div className="form-label">Modèle</div>
              <select
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
              >
                {testState.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* isDefault (défaut d'usine pour TOUS les users) : admin + scope=shared uniquement */}
          {isAdmin && form.scope === 'shared' && testState.status === 'ready' && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                style={{ marginTop: 2 }}
              />
              <span>
                Définir comme <strong>défaut d'usine</strong> (LLM automatique de tous les nouveaux comptes)
              </span>
            </label>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={
              submitting ||
              !form.name ||
              testState.status !== 'ready' ||
              !form.model
            }
            title={testState.status !== 'ready' ? 'Testez d\'abord la connexion' : undefined}
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

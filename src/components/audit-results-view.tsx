'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ExclamationTriangleIcon,
  CheckIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

const ICON_INLINE = { width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' as const }

type Course = Record<string, any>

type Props = {
  sessionId: string
  totalCourses: number
  doneCourses: number
  failedCourses: number
  courses: Course[]
  errors: Array<{ courseId: number; shortname: string; fullname: string; error: string }>
  isPartial?: boolean
}

function scoreClass(s: number) {
  return s >= 75 ? 'high' : s >= 50 ? 'mid' : 'low'
}

export function AuditResultsView({
  sessionId,
  totalCourses,
  doneCourses,
  failedCourses,
  courses,
  errors,
  isPartial = false,
}: Props) {
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterTeacher, setFilterTeacher] = useState<string>('all')
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('score_global')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<number | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    courses.forEach(c => {
      if (c.category) set.add(String(c.category))
      const path = c.category_path
      if (Array.isArray(path) && path.length) set.add(String(path[0]))
    })
    return ['all', ...Array.from(set).sort()]
  }, [courses])

  const teachers = useMemo(() => {
    const set = new Set<string>()
    courses.forEach(c => {
      const list = c.animateurs ?? []
      for (const a of list) if (a?.nom) set.add(String(a.nom))
    })
    return ['all', ...Array.from(set).sort()]
  }, [courses])

  const levels = useMemo(() => {
    const set = new Set<string>()
    courses.forEach(c => {
      if (c.ai?.niveau) set.add(String(c.ai.niveau))
    })
    return ['all', ...Array.from(set).sort()]
  }, [courses])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = courses.filter(c => {
      const matchSearch =
        !q ||
        String(c.fullname ?? '').toLowerCase().includes(q) ||
        String(c.shortname ?? '').toLowerCase().includes(q) ||
        String(c.category ?? '').toLowerCase().includes(q) ||
        String(c.ai?.description_courte ?? '').toLowerCase().includes(q) ||
        (c.animateurs ?? []).some((a: any) => String(a?.nom ?? '').toLowerCase().includes(q))
      const matchCat =
        filterCategory === 'all' ||
        c.category === filterCategory ||
        (Array.isArray(c.category_path) && c.category_path[0] === filterCategory)
      const matchTeach =
        filterTeacher === 'all' ||
        (c.animateurs ?? []).some((a: any) => a?.nom === filterTeacher)
      const matchLevel = filterLevel === 'all' || c.ai?.niveau === filterLevel
      return matchSearch && matchCat && matchTeach && matchLevel
    })
    list.sort((a, b) => {
      const va = a[sortBy] ?? 0
      const vb = b[sortBy] ?? 0
      if (va === vb) return 0
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return list
  }, [courses, search, filterCategory, filterTeacher, filterLevel, sortBy, sortDir])

  const stats = useMemo(
    () => ({
      total: filtered.length,
      avgScore: filtered.length
        ? Math.round(
            filtered.reduce((acc, r) => acc + Number(r.score_global ?? 0), 0) / filtered.length,
          )
        : 0,
      totalInscrits: filtered.reduce((acc, r) => acc + Number(r.nb_inscrits ?? 0), 0),
      totalSequences: filtered.reduce((acc, r) => acc + Number(r.nb_sections ?? 0), 0),
      totalQuiz: filtered.reduce((acc, r) => acc + Number(r.nb_quiz ?? 0), 0),
      totalDevoirs: filtered.reduce((acc, r) => acc + Number(r.nb_devoirs ?? 0), 0),
      high: filtered.filter(r => Number(r.score_global ?? 0) >= 75).length,
    }),
    [filtered],
  )

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const SortTh = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {children}{' '}
      {sortBy === col &&
        (sortDir === 'asc' ? (
          <ChevronUpIcon style={ICON_INLINE} />
        ) : (
          <ChevronDownIcon style={ICON_INLINE} />
        ))}
    </th>
  )

  return (
    <div className="flex-col-16">
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        <Stat n={stats.total} l="cours audités" />
        <Stat n={stats.avgScore} l="score moyen /100" />
        <Stat
          n={stats.totalInscrits}
          l="inscriptions cumulées"
          hint="Somme des inscrits par cours — un même étudiant inscrit à 5 cours est compté 5 fois. Le nombre d'utilisateurs uniques est disponible dans les Détails plateforme."
        />
        <Stat n={stats.totalSequences} l="séquences total" />
        <Stat n={stats.totalQuiz} l="tests connaissance" />
        <Stat n={stats.totalDevoirs} l="devoirs total" />
        <Stat n={stats.high} l="score ≥ 75" />
      </div>

      <div className="filters-row" style={{ flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Rechercher cours, enseignant, catégorie…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          {categories.map(c => (
            <option key={c} value={c}>
              {c === 'all' ? 'Toutes catégories' : c}
            </option>
          ))}
        </select>
        <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
          {teachers.map(t => (
            <option key={t} value={t}>
              {t === 'all' ? 'Tous enseignants' : t}
            </option>
          ))}
        </select>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          {levels.map(l => (
            <option key={l} value={l}>
              {l === 'all' ? 'Tous niveaux' : l}
            </option>
          ))}
        </select>
      </div>

      {isPartial && (
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--brand-light)',
            border: '1px solid var(--brand2)',
            color: 'var(--brand)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
          }}
        >
          ⓘ Audit en cours — {courses.length} cours déjà analysés sur {totalCourses}. Les résultats sont mis à jour
          au fur et à mesure. Vous pouvez exporter à tout moment via les boutons en haut.
        </div>
      )}

      {failedCourses > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ExclamationTriangleIcon className="card-icon" /> Échecs ({failedCourses})
            </span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {errors.slice(0, 10).map(e => (
                <div key={e.courseId} style={{ marginBottom: 4 }}>
                  <code style={{ fontSize: 11 }}>{e.shortname}</code> — {e.error}
                </div>
              ))}
              {errors.length > 10 && (
                <div style={{ color: 'var(--text3)' }}>… et {errors.length - 10} de plus</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <SortTh col="shortname">Code</SortTh>
                <SortTh col="fullname">Intitulé</SortTh>
                <SortTh col="category">Catégorie</SortTh>
                <th>Visible</th>
                <SortTh col="year_modified">Révisé</SortTh>
                <SortTh col="nb_inscrits">Inscrits</SortTh>
                <SortTh col="nb_sections">Séquences</SortTh>
                <SortTh col="nb_activites">Activités</SortTh>
                <SortTh col="nb_quiz">Quiz</SortTh>
                <SortTh col="nb_devoirs">Devoirs</SortTh>
                <th>Niveau</th>
                <th>Enseignant(s)</th>
                <SortTh col="score_global">Score</SortTh>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={14}>Aucun résultat</td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const isExp = expanded === i
                const sc = Number(r.score_global ?? 0)
                const niveau = String(r.ai?.niveau ?? '')
                return (
                  <CourseRow
                    key={i}
                    course={r}
                    score={sc}
                    niveau={niveau}
                    isExp={isExp}
                    onToggle={() => setExpanded(isExp ? null : i)}
                    sessionId={sessionId}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text3)' }}>
          {doneCourses} cours analysés sur {totalCourses}
          {failedCourses > 0 ? ` · ${failedCourses} échec(s)` : ''}
        </div>
      </div>
    </div>
  )
}

function Stat({ n, l, hint }: { n: number | string; l: string; hint?: string }) {
  return (
    <div className="stat-card" title={hint}>
      <div className="stat-num">{n}</div>
      <div className="stat-label">
        {l}
        {hint && <span style={{ marginLeft: 4, color: 'var(--text3)', cursor: 'help' }}>ⓘ</span>}
      </div>
    </div>
  )
}

function CourseRow({
  course: r,
  score,
  niveau,
  isExp,
  onToggle,
  sessionId,
}: {
  course: Course
  score: number
  niveau: string
  isExp: boolean
  onToggle: () => void
  sessionId?: string
}) {
  return (
    <>
      <tr className={isExp ? 'expanded' : ''}>
        <td>
          <code
            style={{
              fontSize: 11,
              background: 'var(--surface2)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {r.shortname}
          </code>
        </td>
        <td style={{ maxWidth: 220, fontWeight: 500 }}>
          {r.fullname}
          {r.data_incomplete && (
            <span
              className="badge badge-warn"
              style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px' }}
              title={
                Array.isArray(r.data_incomplete_calls) && r.data_incomplete_calls.length > 0
                  ? `Données partielles — ${r.data_incomplete_calls.length} appel(s) Moodle en échec après retry :\n` +
                    (r.data_incomplete_calls as Array<{ wsfunction: string; error: string }>)
                      .map(c => `• ${c.wsfunction}: ${c.error}`)
                      .join('\n')
                  : 'Données partielles'
              }
            >
              <ExclamationTriangleIcon style={ICON_INLINE} /> partiel
            </span>
          )}
        </td>
        <td style={{ fontSize: 11, color: 'var(--text2)' }}>
          {Array.isArray(r.category_path) && r.category_path.length > 0
            ? r.category_path.join(' › ')
            : r.category ?? '—'}
        </td>
        <td>
          <span
            style={{
              fontSize: 11,
              color: r.visible ? 'var(--success)' : 'var(--text3)',
              fontWeight: 500,
            }}
          >
            {r.visible ? '● Oui' : '○ Non'}
          </span>
        </td>
        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.year_modified ?? '—'}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>
          {r.nb_inscrits ?? 0}
        </td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.nb_sections ?? 0}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.nb_activites ?? 0}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.nb_quiz ?? 0}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.nb_devoirs ?? 0}</td>
        <td>
          {niveau && (
            <span
              className={`badge ${
                niveau === 'avancé'
                  ? 'badge-danger'
                  : niveau === 'intermédiaire'
                    ? 'badge-warn'
                    : 'badge-success'
              }`}
            >
              {niveau}
            </span>
          )}
        </td>
        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(r.enseignants ?? []).slice(0, 1).map((a: any, j: number) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 99,
                    background: '#EBF5FB',
                    color: '#1A5276',
                    fontWeight: 500,
                  }}
                >
                  ENS
                </span>
                <span style={{ fontSize: 11 }}>{a.nom}</span>
              </div>
            ))}
            {(r.tuteurs ?? []).slice(0, 1).map((a: any, j: number) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 99,
                    background: '#FEF9E7',
                    color: '#7D6608',
                    fontWeight: 500,
                  }}
                >
                  TUT
                </span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.nom}</span>
              </div>
            ))}
            {!(r.enseignants ?? []).length && !(r.tuteurs ?? []).length && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
            )}
          </div>
        </td>
        <td>
          <div className={`score-circle ${scoreClass(score)}`}>{score}</div>
        </td>
        <td>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 8px' }}
              onClick={onToggle}
              title={isExp ? 'Refermer' : 'Aperçu rapide'}
            >
              {isExp ? <ChevronUpIcon style={{ width: 14, height: 14 }} /> : <ChevronDownIcon style={{ width: 14, height: 14 }} />}
            </button>
            {sessionId && r.course_id && (
              <Link
                href={`/audits/${sessionId}/cours/${r.course_id}`}
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px' }}
                title="Voir en pleine page"
              >
                <ArrowTopRightOnSquareIcon style={{ width: 14, height: 14 }} />
              </Link>
            )}
          </div>
        </td>
      </tr>
      {isExp && (
        <tr>
          <td colSpan={14} style={{ padding: 0 }}>
            <CourseDetail course={r} />
          </td>
        </tr>
      )}
    </>
  )
}

function CourseDetail({ course: c }: { course: Course }) {
  return (
    <div className="detail-panel">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {([
          ['Pertinence contenu', c.ai?.pertinence_contenu, 10],
          ['Qualité évaluation', c.ai?.qualite_evaluation, 10],
          ['Structure pédago.', c.ai?.structure_pedagogique, 10],
          ['Engagement prévu', c.ai?.engagement_prevu, 10],
        ] as Array<[string, number, number]>).map(([label, val, max]) => {
          const v = Number(val ?? 0)
          return (
            <div
              key={label}
              style={{
                background: 'var(--surface)',
                padding: 12,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--brand)',
                  marginBottom: 6,
                }}
              >
                {v}/{max}
              </div>
              <div className="score-bar">
                <div
                  className={`score-fill ${scoreClass(v * 10)}`}
                  style={{ width: `${(v / max) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="detail-grid">
        <div className="detail-section">
          <h4>Description</h4>
          <p>{c.ai?.description_courte || '—'}</p>

          {(c.ai?.objectifs_pedagogiques ?? []).length > 0 && (
            <>
              <h4 style={{ marginTop: 12 }}>Objectifs pédagogiques</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12, color: 'var(--text2)' }}>
                {(c.ai.objectifs_pedagogiques as string[]).map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          )}

          {c.ai?.public_cible && (
            <>
              <h4 style={{ marginTop: 12 }}>Public cible</h4>
              <p>{c.ai.public_cible}</p>
            </>
          )}

          {((c.ai?.technologies_utilisees ?? []).length > 0 ||
            (c.ai?.competences_visees ?? []).length > 0) && (
            <>
              <h4 style={{ marginTop: 12 }}>Technologies & Compétences</h4>
              <div className="tag-list">
                {[...(c.ai.technologies_utilisees ?? []), ...(c.ai.competences_visees ?? [])].map(
                  (t: string, i: number) => (
                    <span key={i} className="tag">
                      {t}
                    </span>
                  ),
                )}
              </div>
            </>
          )}

          {c.conformite_statut && (
            <>
              <h4 style={{ marginTop: 12 }}>Conformité DITSI</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      c.conformite_statut === 'Conforme'
                        ? 'var(--success)'
                        : c.conformite_statut === 'A améliorer'
                          ? 'var(--warn)'
                          : 'var(--danger)',
                  }}
                >
                  {c.conformite_statut}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{c.conformite_pct}%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {Object.entries(c.conformite_checks ?? {}).map(([key, val]) => (
                  <div
                    key={key}
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <span style={{ color: val ? 'var(--success)' : 'var(--danger)', display: 'inline-flex' }}>
                      {val ? <CheckIcon style={{ width: 13, height: 13 }} /> : <XMarkIcon style={{ width: 13, height: 13 }} />}
                    </span>
                    <span style={{ color: 'var(--text2)' }}>{labelOfCheck(key)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="detail-section">
          {(c.ai?.points_forts ?? []).length > 0 && (
            <>
              <h4>Points forts</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                {(c.ai.points_forts as string[]).map((p, i) => (
                  <li key={i} style={{ color: 'var(--text2)' }}>
                    <CheckIcon style={{ ...ICON_INLINE, color: 'var(--success)' }} /> {p}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(c.ai?.points_faibles ?? []).length > 0 && (
            <>
              <h4 style={{ marginTop: 12 }}>Points faibles</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                {(c.ai.points_faibles as string[]).map((p, i) => (
                  <li key={i} style={{ color: 'var(--text2)' }}>
                    <XMarkIcon style={{ ...ICON_INLINE, color: 'var(--danger)' }} /> {p}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(c.ai?.recommandations ?? []).length > 0 && (
            <>
              <h4 style={{ marginTop: 12 }}>Recommandations</h4>
              <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                {(c.ai.recommandations as string[]).map((r, i) => (
                  <li key={i} style={{ color: 'var(--text2)' }}>
                    → {r}
                  </li>
                ))}
              </ul>
            </>
          )}
          {c.ai?.justification_score && (
            <>
              <h4 style={{ marginTop: 12 }}>Justification score</h4>
              <p style={{ fontStyle: 'italic' }}>{c.ai.justification_score}</p>
            </>
          )}
        </div>

        <div className="detail-section">
          <h4>
            Personnel ({(c.nb_enseignants ?? 0) + (c.nb_tuteurs ?? 0)} pers.)
            {c.cours_orphelin && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  padding: '1px 7px',
                  borderRadius: 99,
                }}
              >
                <ExclamationTriangleIcon style={ICON_INLINE} /> Cours orphelin
              </span>
            )}
          </h4>
          {(c.enseignants ?? []).length === 0 && (c.tuteurs ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Aucun personnel détecté</p>
          )}
          {(c.enseignants ?? []).map((a: any, i: number) => (
            <StaffCard key={`e${i}`} person={a} color="info" />
          ))}
          {(c.tuteurs ?? []).map((a: any, i: number) => (
            <StaffCard key={`t${i}`} person={a} color="warning" />
          ))}

          {(c.quiz_stats ?? []).length > 0 && (
            <>
              <h4 style={{ marginTop: 14 }}>Tests de connaissance ({c.nb_quiz})</h4>
              {(c.quiz_stats as any[]).map((q, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 6,
                    marginBottom: 8,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      background: 'var(--brand-light)',
                      padding: '6px 10px',
                      fontWeight: 600,
                      fontSize: 12,
                      color: 'var(--brand)',
                    }}
                  >
                    {q.nom}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4,1fr)',
                      fontSize: 11,
                    }}
                  >
                    {([
                      ['Questions', q.nb_questions || '—'],
                      ['Note max', q.note_max ? `${q.note_max}/20` : '—'],
                      ['Tentatives', q.attempts ?? '—'],
                      ['Terminées', q.attempts_termines ?? '—'],
                      ['Participants', q.nb_participants ?? '—'],
                      ['Taux particip.', q.taux_participation != null ? `${q.taux_participation}%` : '—'],
                      ['Score moyen', q.score_moyen ? `${q.score_moyen}` : '—'],
                      ['Taux complétion', q.taux_completion != null ? `${q.taux_completion}%` : '—'],
                    ] as Array<[string, string | number]>).map(([label, val]) => (
                      <div
                        key={label}
                        style={{ padding: '5px 8px', borderTop: '1px solid var(--border)' }}
                      >
                        <div style={{ color: 'var(--text3)', fontSize: 10, marginBottom: 1 }}>
                          {label}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--mono)',
                            fontWeight: 600,
                            color: val === '—' ? 'var(--text3)' : 'var(--text)',
                          }}
                        >
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function labelOfCheck(key: string): string {
  const map: Record<string, string> = {
    has_enseignant: 'Enseignant assigné',
    has_tuteur: 'Tuteur assigné',
    has_quiz: 'Tests de connaissance',
    has_devoir: 'Devoirs',
    has_forum: 'Forums',
    has_video: 'Vidéo présente',
    has_objectifs: 'Objectifs définis',
    has_eval_finale: 'Évaluation finale',
    not_orphelin: 'Enseignant actif',
    recently_updated: 'Mis à jour (<2 ans)',
    multi_format: 'Multi-formats',
    has_sections: 'Séquences structurées',
  }
  return map[key] ?? key
}

function StaffCard({
  person: a,
  color,
}: {
  person: any
  color: 'info' | 'warning'
}) {
  const cols = {
    info: { bg: '#EBF5FB', text: '#1A5276', border: '#AED6F1' },
    warning: { bg: '#FEF9E7', text: '#7D6608', border: '#F9E79F' },
  } as const
  const col = cols[color]
  const initials = String(a.nom ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        marginBottom: 6,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          flexShrink: 0,
          background: col.bg,
          border: `1px solid ${col.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 500,
          color: col.text,
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{a.nom}</span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 7px',
              borderRadius: 99,
              background: col.bg,
              color: col.text,
              border: `1px solid ${col.border}`,
            }}
          >
            {a.role_label || (a.roles ?? []).join(', ')}
          </span>
        </div>
        {a.email && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text3)',
              fontFamily: 'var(--mono)',
              marginTop: 1,
            }}
          >
            {a.email}
          </div>
        )}
        {a.lastaccess_str && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            Dernier accès : {a.lastaccess_str}
          </div>
        )}
      </div>
    </div>
  )
}

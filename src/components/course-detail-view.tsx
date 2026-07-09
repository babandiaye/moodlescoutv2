import {
  AcademicCapIcon,
  UserGroupIcon,
  ChartBarIcon,
  BookOpenIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
  ChatBubbleLeftEllipsisIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  LightBulbIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'

type Props = {
  result: Record<string, any>
  errorMessage?: string | null
}

function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 50) return '#d97706'
  return '#dc2626'
}

function scoreBg(score: number): string {
  if (score >= 75) return 'rgba(22, 163, 74, 0.1)'
  if (score >= 50) return 'rgba(217, 119, 6, 0.1)'
  return 'rgba(220, 38, 38, 0.1)'
}

/**
 * Vue riche d'un audit de cours unique. Rassemble :
 *  - scores (IA + conformité + hybride) avec code couleur
 *  - IA : description, objectifs, points forts/faibles, recommandations
 *  - Composition : sections, activités, quiz avec stats
 *  - Animateurs (enseignants + tuteurs)
 *  - Conformité structurelle (12 checks)
 *  - Métadonnées (dates, âge, orphelin)
 *
 * Server component pour laisser Next.js optimiser le rendu SSR — pas de state.
 */
export function CourseDetailView({ result, errorMessage }: Props) {
  const ai = (result.ai ?? {}) as Record<string, any>
  const score = Number(result.score_global ?? 0)
  const scoreIa = Number(result.score_ia ?? 0)
  const scoreStruct = Number(result.score_struct ?? 0)
  const conformitePct = Number(result.conformite_pct ?? 0)
  const enseignants = (result.enseignants ?? []) as any[]
  const tuteurs = (result.tuteurs ?? []) as any[]
  const animateurs = (result.animateurs ?? []) as any[]
  const conformiteChecks = (result.conformite_checks ?? {}) as Record<string, boolean>
  const quizStats = (result.quiz_stats ?? []) as any[]
  const sections = (result.sections ?? []) as any[]
  const dataIncomplete = Boolean(result.data_incomplete)

  return (
    <div className="flex-col-16">
      {errorMessage && (
        <div
          style={{
            padding: '12px 14px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid #dc2626',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
          }}
        >
          <ExclamationTriangleIcon style={{ width: 14, height: 14, verticalAlign: '-2px', display: 'inline-block', marginRight: 4 }} />
          <strong>Note :</strong> {errorMessage}
        </div>
      )}

      {dataIncomplete && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(217, 119, 6, 0.1)',
            border: '1px solid #d97706',
            borderRadius: 6,
            color: '#b45309',
            fontSize: 12,
          }}
          title={(result.data_incomplete_calls ?? [])
            .map((c: any) => `${c.wsfunction}: ${c.error}`)
            .join('\n')}
        >
          <ExclamationTriangleIcon style={{ width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block', marginRight: 4 }} />
          Données partielles : {(result.data_incomplete_calls ?? []).length} appel(s) Moodle ont échoué. Score et stats
          peuvent être incomplets.
        </div>
      )}

      {/* Scores */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ChartBarIcon className="card-icon" /> Scores
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <ScoreBlock label="Global (hybride)" score={score} big />
            <ScoreBlock label="Pédagogique (IA)" score={scoreIa} />
            <ScoreBlock label="Conformité" score={scoreStruct} suffix={`(${conformitePct}%)`} />
          </div>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <SubScore label="Pertinence" score={Number(ai.pertinence_contenu ?? 0)} />
            <SubScore label="Qualité éval" score={Number(ai.qualite_evaluation ?? 0)} />
            <SubScore label="Structure péda" score={Number(ai.structure_pedagogique ?? 0)} />
            <SubScore label="Engagement" score={Number(ai.engagement_prevu ?? 0)} />
          </div>
          {ai.justification_score && (
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
              « {String(ai.justification_score)} »
            </p>
          )}
        </div>
      </div>

      {/* Description IA */}
      {(ai.description_courte || ai.public_cible || ai.niveau || ai.duree_estimee || ai.langue || ai.domaine) && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <DocumentTextIcon className="card-icon" /> Analyse IA
            </span>
          </div>
          <div className="card-body">
            {ai.description_courte && (
              <p style={{ fontSize: 14, marginTop: 0, marginBottom: 12 }}>{ai.description_courte}</p>
            )}
            <MetaGrid
              rows={[
                ['Public cible', ai.public_cible],
                ['Niveau', ai.niveau],
                ['Durée estimée', ai.duree_estimee],
                ['Langue', ai.langue],
                ['Domaine', ai.domaine],
              ]}
            />
            {Array.isArray(ai.objectifs_pedagogiques) && ai.objectifs_pedagogiques.length > 0 && (
              <>
                <div className="form-label" style={{ marginTop: 12 }}>Objectifs pédagogiques</div>
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                  {ai.objectifs_pedagogiques.map((o: string, i: number) => <li key={i}>{o}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* Points forts / faibles / recommandations */}
      {(hasList(ai.points_forts) || hasList(ai.points_faibles) || hasList(ai.recommandations)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {hasList(ai.points_forts) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ color: '#16a34a' }}>
                  <CheckCircleIcon className="card-icon" /> Points forts
                </span>
              </div>
              <div className="card-body">
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                  {(ai.points_forts as string[]).map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
                </ul>
              </div>
            </div>
          )}
          {hasList(ai.points_faibles) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ color: '#dc2626' }}>
                  <XCircleIcon className="card-icon" /> Points faibles
                </span>
              </div>
              <div className="card-body">
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                  {(ai.points_faibles as string[]).map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
                </ul>
              </div>
            </div>
          )}
          {hasList(ai.recommandations) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ color: '#d97706' }}>
                  <LightBulbIcon className="card-icon" /> Recommandations
                </span>
              </div>
              <div className="card-body">
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 20 }}>
                  {(ai.recommandations as string[]).map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Composition */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <BookOpenIcon className="card-icon" /> Composition du cours
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
            <MiniStat label="Sections" value={result.nb_sections ?? 0} />
            <MiniStat label="Activités" value={result.nb_activites ?? 0} />
            <MiniStat label="Quiz" value={result.nb_quiz ?? 0} />
            <MiniStat label="Devoirs" value={result.nb_devoirs ?? 0} />
            <MiniStat label="Forums" value={result.nb_forums ?? 0} />
            <MiniStat label="Ressources" value={result.nb_ressources ?? 0} />
            <MiniStat label="Vidéo" value={result.has_video ? 'Oui' : 'Non'} />
            <MiniStat label="Annonces" value={result.nb_annonces ?? 0} />
          </div>
          {sections.length > 0 && (
            <details style={{ fontSize: 13 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text2)' }}>
                Voir le détail par section ({sections.length})
              </summary>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                {sections.map((s: any, i: number) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{s.name}</strong> — {s.count} activité(s)
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* Quiz stats */}
      {quizStats.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ClipboardDocumentCheckIcon className="card-icon" /> Quiz ({quizStats.length})
            </span>
          </div>
          <div className="card-body">
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th style={{ width: 60 }}>Questions</th>
                    <th style={{ width: 80 }}>Tentatives</th>
                    <th style={{ width: 80 }}>Participants</th>
                    <th style={{ width: 80 }}>Score moy.</th>
                    <th style={{ width: 90 }}>Participation</th>
                  </tr>
                </thead>
                <tbody>
                  {quizStats.map((q, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{q.nom}</td>
                      <td>{q.nb_questions}</td>
                      <td>{q.attempts}</td>
                      <td>{q.nb_participants}</td>
                      <td>{q.score_moyen}</td>
                      <td>{q.taux_participation}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Animateurs */}
      {animateurs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <UserGroupIcon className="card-icon" /> Animateurs ({animateurs.length})
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {enseignants.length} enseignant{enseignants.length > 1 ? 's' : ''} · {tuteurs.length} tuteur{tuteurs.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {animateurs.map((a: any, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: 10,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface2)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{a.nom || '—'}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>{a.role_label || (a.roles ?? []).join(', ')}</div>
                  {a.email && (
                    <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11, wordBreak: 'break-all' }}>
                      {a.email}
                    </div>
                  )}
                  {a.lastaccess_str && a.lastaccess_str !== '—' && (
                    <div style={{ marginTop: 2, color: 'var(--text3)', fontSize: 11 }}>
                      Dernier accès : {a.lastaccess_str}
                    </div>
                  )}
                  {a.departement && (
                    <div style={{ marginTop: 2, color: 'var(--text3)', fontSize: 11 }}>
                      Dépt. : {a.departement}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conformité structurelle */}
      {Object.keys(conformiteChecks).length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ClipboardDocumentCheckIcon className="card-icon" /> Conformité structurelle
            </span>
            <span className="badge badge-neutral">
              {Object.values(conformiteChecks).filter(Boolean).length}/{Object.keys(conformiteChecks).length}
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
              {Object.entries(conformiteChecks).map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    background: val ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                    borderRadius: 4,
                    color: val ? '#166534' : '#991b1b',
                  }}
                >
                  {val
                    ? <CheckCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                    : <XCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />}
                  <span>{humanCheckLabel(key)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Métadonnées */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <AcademicCapIcon className="card-icon" /> Métadonnées
          </span>
        </div>
        <div className="card-body">
          <MetaGrid
            rows={[
              ['Inscrits', String(result.nb_inscrits ?? 0)],
              ['Étudiants', String(result.nb_etudiants ?? 0)],
              ['Enseignants', String(result.nb_enseignants ?? 0)],
              ['Tuteurs', String(result.nb_tuteurs ?? 0)],
              ['Créé', result.year_created],
              ['Révisé', result.year_modified],
              ['Dernière mise à jour module', result.last_module_update],
              ['Âge (ans)', result.age_ans !== null && result.age_ans !== undefined ? String(result.age_ans) : null],
              ['Cours orphelin', result.cours_orphelin ? 'Oui' : 'Non'],
              ['Dernier accès enseignant', result.last_teacher_access],
              ['Dernier accès étudiant', result.last_student_access],
              ['Chemin catégorie', Array.isArray(result.category_path) ? result.category_path.join(' / ') : null],
              ['Images extraites', String(result.images_count ?? 0)],
            ]}
          />
        </div>
      </div>

      {/* Infos extraites des images (OCR IA) */}
      {ai.infos_images && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <PhotoIcon className="card-icon" /> Texte extrait des images
            </span>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{String(ai.infos_images)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function hasList(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0
}

function ScoreBlock({ label, score, suffix, big }: { label: string; score: number; suffix?: string; big?: boolean }) {
  return (
    <div
      style={{
        padding: big ? 16 : 12,
        borderRadius: 8,
        background: scoreBg(score),
        border: `1px solid ${scoreColor(score)}`,
      }}
    >
      <div style={{ fontSize: big ? 32 : 24, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>
        {score}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      {suffix && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{suffix}</div>
      )}
    </div>
  )
}

function SubScore({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(100, score * 10))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{score}/10</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: scoreColor(score * 10) }} />
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function MetaGrid({ rows }: { rows: [string, unknown][] }) {
  const filtered = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, fontSize: 13 }}>
      {filtered.map(([k, v]) => (
        <div key={k}>
          <div className="form-label" style={{ marginBottom: 2 }}>{k}</div>
          <div>{String(v)}</div>
        </div>
      ))}
    </div>
  )
}

const CHECK_LABELS: Record<string, string> = {
  has_enseignant: 'Enseignant présent',
  has_tuteur: 'Tuteur présent',
  has_quiz: 'Au moins un quiz',
  has_devoir: 'Au moins un devoir',
  has_forum: 'Au moins un forum',
  has_video: 'Contient de la vidéo',
  has_objectifs: 'Objectifs pédagogiques',
  has_eval_finale: 'Évaluation finale',
  not_orphelin: 'Non orphelin',
  recently_updated: 'Mis à jour récemment',
  multi_format: 'Multi-format',
  has_sections: 'Structuré en sections',
}

function humanCheckLabel(key: string): string {
  return CHECK_LABELS[key] ?? key
}

import {
  getCategoriesTree,
  getCategoryPath,
  getCompletion,
  getCourseContents,
  getCourseImages,
  getCourses,
  getEnrolledUsers,
  getQuizAccessInfo,
  getQuizAttempts,
  getQuizzes,
  stripHtml,
  type CategoriesTree,
  type MoodleCourse,
  type MoodleEnrolledUser,
  type MoodleQuiz,
  type MoodleSection,
} from './moodle'
import { runLlm, type AuditAiResult } from './llm'

export const TYPE_LABELS: Record<string, string> = {
  quiz: 'Test de connaissance',
  assign: 'Devoir',
  forum: 'Forum',
  resource: 'Ressource/Document',
  url: 'Lien URL',
  page: 'Page de contenu',
  folder: 'Dossier',
  label: 'Étiquette',
  glossary: 'Glossaire',
  scorm: 'Module SCORM',
  lesson: 'Leçon',
  choice: 'Sondage',
  wiki: 'Wiki',
  workshop: 'Atelier',
  feedback: 'Questionnaire',
  chat: 'Chat',
  h5pactivity: 'Activité H5P',
  lti: 'Outil externe',
  bigbluebuttonbn: 'Visioconférence BBB',
  videotime: 'Vidéo',
}

const DECORATIVE_KEYWORDS = [
  'bienvenue',
  'welcome',
  'image',
  'bannière',
  'banner',
  'présentation générale',
  'index',
  'visuel',
  'illustration',
  'titre',
  'header',
  'en-tête',
  'separator',
  'séparateur',
  'espace',
  'spacer',
  'divider',
]

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.m4v']
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com']

const ROLE_ENSEIGNANT = new Set(['editingteacher', 'coursecreator'])
const ROLE_TUTEUR = new Set(['teacher'])
const WS_ROLES = new Set(['ws_readonly', 'manager'])

type RawModule = MoodleSection['modules'][number]

function isDecorative(mod: RawModule): boolean {
  if (mod.modname !== 'label') return false
  const desc = stripHtml(mod.description ?? '')
  if (!desc || desc.length < 5) return true
  const name = (mod.name ?? '').toLowerCase().trim()
  return DECORATIVE_KEYWORDS.some(kw => name.includes(kw))
}

export type RichExtraction = {
  sections: Array<{
    name: string
    summary: string
    count: number
    total_with_decorative: number
    modules: Array<{ name: string; type: string; type_label: string }>
  }>
  activities: Array<{
    section: string
    name: string
    type: string
    type_label: string
    description: string
    url: string
    files: string[]
    visible: boolean
    completion: number
  }>
  activity_types: Record<string, number>
  text_parts: string[]
  nb_quiz: number
  nb_devoirs: number
  nb_forums: number
  nb_ressources: number
  nb_pages: number
}

export function extractRich(contents: MoodleSection[]): RichExtraction {
  const sections: RichExtraction['sections'] = []
  const activities: RichExtraction['activities'] = []
  const activityTypes: Record<string, number> = {}
  const textParts: string[] = []

  for (const sec of contents) {
    const secName = sec.name || 'Section sans titre'
    const secSum = stripHtml(sec.summary ?? '').slice(0, 400)
    const mods = sec.modules ?? []
    const realMods = mods.filter(m => !isDecorative(m))

    const secData: RichExtraction['sections'][number] = {
      name: secName,
      summary: secSum,
      count: realMods.length,
      total_with_decorative: mods.length,
      modules: [],
    }
    if (secSum) textParts.push(`SECTION '${secName}': ${secSum.slice(0, 300)}`)

    for (const mod of realMods) {
      const mtype = mod.modname || 'resource'
      const mname = mod.name || ''
      activityTypes[mtype] = (activityTypes[mtype] ?? 0) + 1
      const desc = stripHtml(mod.description ?? '').slice(0, 400)
      const files: string[] = []
      for (const c of mod.contents ?? []) {
        if (c.type === 'file' && c.filename) {
          files.push(`${c.filename} (${Math.round((c.filesize ?? 0) / 1024)}Ko)`)
        }
      }
      activities.push({
        section: secName,
        name: mname,
        type: mtype,
        type_label: TYPE_LABELS[mtype] ?? mtype,
        description: desc,
        url: mod.url ?? '',
        files,
        visible: (mod.visible ?? 1) === 1,
        completion: mod.completion ?? 0,
      })
      secData.modules.push({
        name: mname,
        type: mtype,
        type_label: TYPE_LABELS[mtype] ?? mtype,
      })
      const parts = [`[${TYPE_LABELS[mtype] ?? mtype}] ${mname}`]
      if (desc) parts.push(desc.slice(0, 250))
      if (files.length) parts.push(`Fichiers: ${files.join(', ')}`)
      textParts.push(parts.join(' — '))
    }
    sections.push(secData)
  }

  const at = activityTypes
  return {
    sections,
    activities,
    activity_types: at,
    text_parts: textParts,
    nb_quiz: at.quiz ?? 0,
    nb_devoirs: at.assign ?? 0,
    nb_forums: at.forum ?? 0,
    nb_ressources: (at.resource ?? 0) + (at.url ?? 0) + (at.folder ?? 0),
    nb_pages: at.page ?? 0,
  }
}

function fmtDate(ts?: number): string | null {
  if (!ts) return null
  const d = new Date(ts * 1000)
  if (isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getYear(ts?: number): number | string {
  if (!ts) return '—'
  return new Date(ts * 1000).getFullYear()
}

function daysSince(ts?: number): number | null {
  if (!ts) return null
  return Math.floor((Date.now() - ts * 1000) / 86400000)
}

export type AuditOptions = {
  extractImages: boolean
  quizDetail: 'meta' | 'detail' | 'both'
}

export type AuditCourseInput = {
  course: MoodleCourse
  baseUrl: string
  token: string
  platformName: string
  platformVersion: string
}

export type AuditCourseLlmConfig = {
  provider: 'ollama' | 'anthropic'
  apiUrl: string | null
  apiKey: string | null
  model: string
}

export type AuditCourseResult = Record<string, any>

export async function auditCourse(
  input: AuditCourseInput,
  llm: AuditCourseLlmConfig,
  opts: AuditOptions,
  categoriesTree?: CategoriesTree,
): Promise<AuditCourseResult> {
  const { course, baseUrl, token, platformName, platformVersion } = input
  const cid = course.id ?? 0

  // Collecte les fonctions Moodle qui ont fallback (échec après retry transitoire).
  // Permet de marquer le cours comme `data_incomplete` dans le rapport final.
  const incompleteCalls: Array<{ wsfunction: string; error: string }> = []
  const trackErr = (err: Error, wsfunction: string) => {
    incompleteCalls.push({ wsfunction, error: err.message.slice(0, 200) })
  }

  const [contents, enrolled, quizzes] = await Promise.all([
    getCourseContents(baseUrl, token, cid, trackErr),
    getEnrolledUsers(baseUrl, token, cid, trackErr),
    getQuizzes(baseUrl, token, cid, trackErr),
  ])

  const summary = stripHtml(course.summary ?? '')
  const created = course.timecreated ?? 0
  const modified = course.timemodified ?? 0

  const rich = extractRich(contents)

  const enseignants: any[] = []
  const tuteurs: any[] = []
  const students: any[] = []
  const lastAccessAll: number[] = []

  for (const u of enrolled as MoodleEnrolledUser[]) {
    const roles = (u.roles ?? []).map(r => r.shortname).filter(Boolean)
    if (roles.length && roles.every(r => WS_ROLES.has(r))) continue

    const lastAcc = u.lastcourseaccess ?? 0
    lastAccessAll.push(lastAcc)
    const p: any = {
      nom: u.fullname ?? '',
      email: u.email ?? '',
      roles,
      role_label: '',
      avatar: u.profileimageurl ?? '',
      departement: '',
      bio: '',
      lastaccess: lastAcc,
      lastaccess_str: lastAcc ? fmtDate(lastAcc) : 'Jamais',
      nb_forums_posts: null,
      nb_devoirs_corriges: null,
      nb_annonces: null,
      taux_reponse_forum: null,
    }
    if (roles.some(r => ROLE_ENSEIGNANT.has(r))) {
      p.role_label = 'Enseignant'
      enseignants.push(p)
    } else if (roles.some(r => ROLE_TUTEUR.has(r))) {
      p.role_label = 'Tuteur'
      tuteurs.push(p)
    } else {
      students.push(p)
    }
  }

  const teachers = [...enseignants, ...tuteurs]
  const lastStudentAccess = Math.max(0, ...lastAccessAll.filter(a => a > 0))
  const lastTeacherAccess = Math.max(
    0,
    ...teachers.map(p => p.lastaccess as number).filter(a => a > 0),
  )
  const coursAgeJours = daysSince(modified)

  const quizStats: any[] = []
  let totalAtt = 0
  for (const q of quizzes as MoodleQuiz[]) {
    const qid = q.id
    let attempts: any[] = []
    if (opts.quizDetail === 'detail' || opts.quizDetail === 'both') {
      attempts = await getQuizAttempts(baseUrl, token, qid, trackErr)
    }
    totalAtt += attempts.length
    const finished = attempts.filter(a => a.state === 'finished')
    const scores = finished
      .map(a => Number(a.sumgrades ?? 0))
      .filter(s => Number.isFinite(s))

    const qinfo = await getQuizAccessInfo(baseUrl, token, qid, trackErr)
    let nbQuestions =
      Number(qinfo.numquestions ?? 0) || Number(q.questioncount ?? 0) || Number(q.numattempts ?? 0)
    if (!nbQuestions && finished.length) {
      nbQuestions = (finished[0]?.questions ?? []).length
    }

    const noteMax = Number(q.grade ?? q.sumgrades ?? 0)
    const timeLimit = q.timelimit ?? 0
    const nbInscrits = enrolled.length
    const uniqueParticipants = new Set(attempts.map(a => a.userid ?? 0)).size
    const tauxParticipation = nbInscrits > 0 && attempts.length
      ? Math.round((uniqueParticipants / nbInscrits) * 100)
      : 0

    quizStats.push({
      nom: q.name ?? '',
      nb_questions: nbQuestions,
      note_max: noteMax,
      attempts: attempts.length,
      attempts_termines: finished.length,
      nb_participants: uniqueParticipants,
      taux_participation: tauxParticipation,
      score_moyen: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
      score_max_obtenu: scores.length ? Math.round(Math.max(...scores) * 10) / 10 : 0,
      score_min_obtenu: scores.length ? Math.round(Math.min(...scores) * 10) / 10 : 0,
      taux_completion: attempts.length ? Math.round((finished.length / attempts.length) * 100) : 0,
      time_limit: timeLimit,
      time_limit_min: timeLimit ? Math.round(timeLimit / 60) : 0,
      attempts_max: q.attempts ?? 0,
      attempts_max_label: (q.attempts ?? 0) === 0 ? 'Illimité' : String(q.attempts),
    })
  }

  const images = opts.extractImages
    ? await getCourseImages(baseUrl, token, cid, contents)
    : []

  let nbAnnonces = 0
  for (const sec of contents) {
    for (const mod of sec.modules ?? []) {
      if (mod.modname === 'forum') {
        const fname = (mod.name ?? '').toLowerCase()
        if (fname.includes('annonce') || fname.includes('news') || fname.includes('nouvelle')) {
          nbAnnonces += (mod.contents ?? []).length
        }
      }
    }
  }

  let hasVideo = false
  outer: for (const sec of contents) {
    for (const mod of sec.modules ?? []) {
      const mtype = mod.modname ?? ''
      if (mtype === 'videotime' || mtype === 'hvp' || mtype === 'h5pactivity') {
        hasVideo = true
        break outer
      }
      if (mtype === 'url') {
        const u = (mod.url ?? '').toLowerCase()
        if (VIDEO_HOSTS.some(h => u.includes(h))) {
          hasVideo = true
          break outer
        }
      }
      for (const c of mod.contents ?? []) {
        const fname = (c.filename ?? '').toLowerCase()
        if (VIDEO_EXTENSIONS.some(ext => fname.endsWith(ext))) {
          hasVideo = true
          break outer
        }
      }
    }
  }

  const at = rich.activity_types
  const totalAct = Math.max(rich.activities.length, 1)
  const formatDiversity = {
    quiz_pct: Math.round(((at.quiz ?? 0) / totalAct) * 100),
    devoir_pct: Math.round(((at.assign ?? 0) / totalAct) * 100),
    forum_pct: Math.round(((at.forum ?? 0) / totalAct) * 100),
    ressource_pct: Math.round((((at.resource ?? 0) + (at.url ?? 0) + (at.folder ?? 0)) / totalAct) * 100),
    video_pct: Math.round((((at.videotime ?? 0) + (at.hvp ?? 0)) / totalAct) * 100),
    page_pct: Math.round(((at.page ?? 0) / totalAct) * 100),
    is_monomedia: Object.values(at).filter(v => v > 0).length <= 1,
  }

  const moduleDates: number[] = []
  for (const sec of contents) {
    for (const mod of sec.modules ?? []) {
      const td = mod.timemodified ?? 0
      if (td > 0) moduleDates.push(td)
    }
  }
  const lastModuleUpdate = moduleDates.length ? Math.max(...moduleDates) : 0

  const completion = await getCompletion(baseUrl, token, cid, trackErr)
  let completionRate: number | null = null
  let nbActivitesAvecCompletion = 0
  if (completion?.statuses?.length) {
    nbActivitesAvecCompletion = completion.statuses.length
    const completed = completion.statuses.filter(s => s.state === 1).length
    completionRate = Math.round((completed / completion.statuses.length) * 100)
  }

  const startdate = course.startdate ?? 0
  const enddate = course.enddate ?? 0
  const ageAns = created
    ? Math.round(((Date.now() - created * 1000) / (365 * 86400000)) * 10) / 10
    : null
  const alerteRevision = coursAgeJours !== null && coursAgeJours > 730

  let hasFinalEval = false
  if (rich.activities.length && rich.sections.length) {
    const lastSecName = rich.sections[rich.sections.length - 1].name
    const lastActs = rich.activities.filter(a => a.section === lastSecName)
    hasFinalEval = lastActs.some(a => a.type === 'quiz' || a.type === 'assign')
  }
  if (!hasFinalEval) hasFinalEval = rich.nb_quiz > 0 || rich.nb_devoirs > 0

  let coursOrphelin = false
  if (lastTeacherAccess > 0) {
    const joursAbsence = daysSince(lastTeacherAccess) ?? 0
    coursOrphelin = joursAbsence > 30
  } else if (teachers.length === 0) {
    coursOrphelin = true
  }

  const text = [
    `COURS: ${course.fullname ?? ''}`,
    `CODE: ${course.shortname ?? ''}`,
    `RÉSUMÉ: ${summary}`,
    ...rich.text_parts,
  ].join('\n')

  const ai: AuditAiResult = await runLlm({
    provider: llm.provider,
    apiUrl: llm.apiUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    content: text,
    images,
  })

  const animateurs: any[] = []
  for (const p of enseignants) animateurs.push({ ...p, role_label: 'Enseignant' })
  for (const p of tuteurs) animateurs.push({ ...p, role_label: 'Tuteur' })
  for (const a of ai.animateurs_detectes ?? []) {
    const nom = (a.nom ?? '').trim()
    if (!nom) continue
    if (animateurs.some(p => p.nom.toLowerCase() === nom.toLowerCase())) continue
    animateurs.push({
      nom,
      email: a.email ?? '',
      roles: [a.role ?? 'Enseignant'],
      role_label: (a.role ?? '').toLowerCase().includes('tuteur') ? 'Tuteur' : 'Enseignant',
      departement: a.departement ?? '',
      bio: a.bio ?? '',
      avatar: '',
      lastaccess: 0,
      lastaccess_str: '—',
      nb_forums_posts: null,
      nb_devoirs_corriges: null,
      nb_annonces: null,
      taux_reponse_forum: null,
    })
  }

  const scIa = Math.min(100, Math.max(0, ai.score_global ?? 0))
  const bonus =
    (rich.sections.length >= 3 ? 5 : 0) +
    (rich.nb_quiz >= 1 ? 5 : 0) +
    (rich.nb_devoirs >= 1 ? 3 : 0) +
    (enseignants.length ? 3 : 0) +
    (tuteurs.length ? 2 : 0) +
    (summary ? 2 : 0) +
    (rich.activities.length >= 5 ? 5 : 0) +
    (images.length ? 2 : 0) +
    (hasVideo ? 3 : 0)
  const score = scIa > 0 ? Math.min(100, Math.max(0, scIa + bonus)) : 0

  const conformiteChecks = {
    has_enseignant: enseignants.length > 0,
    has_tuteur: tuteurs.length > 0,
    has_quiz: rich.nb_quiz > 0,
    has_devoir: rich.nb_devoirs > 0,
    has_forum: rich.nb_forums > 0,
    has_video: hasVideo,
    has_objectifs: !!(ai.objectifs_pedagogiques?.length),
    has_eval_finale: hasFinalEval,
    not_orphelin: !coursOrphelin,
    recently_updated: !alerteRevision,
    multi_format: !formatDiversity.is_monomedia,
    has_sections: rich.sections.length >= 2,
  }
  const nbOk = Object.values(conformiteChecks).filter(Boolean).length
  const nbTotal = Object.keys(conformiteChecks).length
  const conformitePct = Math.round((nbOk / nbTotal) * 100)
  const conformiteStatut =
    conformitePct >= 80 ? 'Conforme' : conformitePct >= 50 ? 'A améliorer' : 'Non conforme'

  let categoryPath: string[] = []
  if (categoriesTree && course.categoryid) {
    categoryPath = getCategoryPath(course.categoryid, categoriesTree)
  }

  return {
    platform: platformName || baseUrl,
    platform_url: baseUrl,
    moodle_version: platformVersion,
    course_id: cid,
    shortname: course.shortname ?? '',
    fullname: course.fullname ?? '',
    category: course.categoryname ?? String(course.categoryid ?? ''),
    category_id: course.categoryid ?? 0,
    category_path: categoryPath,
    visible: (course.visible ?? 1) === 1,

    year_created: getYear(created),
    year_modified: getYear(modified),
    date_extraction: new Date().toISOString().slice(0, 16).replace('T', ' '),
    age_ans: ageAns,
    alerte_revision: alerteRevision,
    last_module_update: fmtDate(lastModuleUpdate),
    startdate: fmtDate(startdate),
    enddate: fmtDate(enddate),

    nb_inscrits: enrolled.length,
    nb_etudiants: students.length,
    nb_enseignants: enseignants.length,
    nb_tuteurs: tuteurs.length,
    enseignants,
    tuteurs,
    animateurs,
    cours_orphelin: coursOrphelin,
    last_teacher_access: lastTeacherAccess ? fmtDate(lastTeacherAccess) : null,
    last_student_access: lastStudentAccess ? fmtDate(lastStudentAccess) : null,

    nb_sections: rich.sections.length,
    nb_activites: rich.activities.length,
    sections: rich.sections,
    activities: rich.activities,
    activity_types: rich.activity_types,
    nb_quiz: rich.nb_quiz,
    nb_devoirs: rich.nb_devoirs,
    nb_forums: rich.nb_forums,
    nb_ressources: rich.nb_ressources,
    nb_pages: rich.nb_pages,
    has_video: hasVideo,
    nb_annonces: nbAnnonces,
    format_diversity: formatDiversity,

    quiz_stats: quizStats,
    total_quiz_attempts: totalAtt,

    completion_rate: completionRate,
    nb_activites_avec_completion: nbActivitesAvecCompletion,

    has_final_eval: hasFinalEval,
    images_count: images.length,

    ai,
    score_ia: scIa,
    score_bonus: bonus,
    score_global: score,

    conformite_checks: conformiteChecks,
    conformite_pct: conformitePct,
    conformite_statut: conformiteStatut,

    // Données incomplètes : true si au moins un appel Moodle WS a fallback
    // (échec après retry transitoire). Le détail est dans data_incomplete_calls.
    data_incomplete: incompleteCalls.length > 0,
    data_incomplete_calls: incompleteCalls,
  }
}

export type ListCoursesOpts = {
  baseUrl: string
  token: string
  categoryFilter?: string[]
}

export async function listCoursesForAudit(
  opts: ListCoursesOpts,
): Promise<{ courses: MoodleCourse[]; tree: CategoriesTree }> {
  const [courses, tree] = await Promise.all([
    getCourses(opts.baseUrl, opts.token),
    getCategoriesTree(opts.baseUrl, opts.token),
  ])

  if (!opts.categoryFilter?.length) return { courses, tree }

  // Match partiel insensible à la casse : un terme du filtre matche dès qu'il
  // est CONTENU (substring) dans n'importe quel segment du chemin de catégorie.
  // Exemples :
  //   filtre "IDA"  matche "IDA", "IDA - Promotion 2024", "Master IDA Pro"
  //   filtre "L1"   matche "L1", "Licence 1 (L1)", "L1-MIC"
  // Les termes vides ou whitespace-only sont ignorés.
  const filterTerms = opts.categoryFilter
    .map(s => s.toLowerCase().trim())
    .filter(Boolean)
  if (filterTerms.length === 0) return { courses, tree }

  const matched = courses.filter(c => {
    const path = getCategoryPath(c.categoryid ?? 0, tree).map(s => s.toLowerCase())
    return path.some(segment => filterTerms.some(t => segment.includes(t)))
  })
  return { courses: matched, tree }
}

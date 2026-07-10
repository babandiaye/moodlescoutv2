import axios, { AxiosError } from 'axios'
import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { redis } from './redis'
import { logger } from './logger'
import { pLimit } from './concurrency'

const MOODLE_RETRY_ATTEMPTS = 2 // 1 essai initial + 1 retry
const MOODLE_RETRY_DELAY_MS = 2000

// ─── Cache Moodle WS ──────────────────────────────────────────
// Mutualise les appels WS lourds entre audits parallèles sur la même plateforme.
// Clés Redis : `moodle:ws:<wsfunction>:<baseUrl>:<tokenHash>`
// Le token n'est jamais stocké en clair : on en hashe les 16 premiers chars.

const CACHE_PREFIX = 'moodle:ws'

function hashToken(token: string): string {
  return createHash('sha1').update(token).digest('hex').slice(0, 16)
}

function cacheKey(wsfunction: string, baseUrl: string, token: string): string {
  return `${CACHE_PREFIX}:${wsfunction}:${baseUrl.replace(/\/+$/, '')}:${hashToken(token)}`
}

async function readCached<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, 'Cache Moodle WS : lecture échouée')
    return null
  }
}

async function writeCached<T>(key: string, value: T, ttlSec: number): Promise<void> {
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec)
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, 'Cache Moodle WS : écriture échouée')
  }
}
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
])

/**
 * Détecte les erreurs transitoires sur lesquelles un retry vaut la peine :
 *   - timeouts réseau / ECONNRESET
 *   - 5xx HTTP (Moodle saturé, base bloquée, etc.)
 * Les erreurs métier Moodle (exception payload `{exception, errorcode}`) ou les 4xx
 * (bad request, auth) ne sont PAS transitoires : on échoue immédiatement.
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    if (err.code && TRANSIENT_NETWORK_CODES.has(err.code)) return true
    const status = err.response?.status
    if (typeof status === 'number' && status >= 500 && status < 600) return true
  }
  return false
}

export async function moodleCall<T = any>(
  baseUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number | string[] | number[]> = {},
  opts: {
    /** Timeout réseau côté axios. Défaut 30s. À pousser à 120-240s pour des
     * fonctions retournant un gros payload (ex: core_user_get_users sur une
     * plateforme avec 20K+ comptes, où Moodle prend 60-180s à sérialiser). */
    timeoutMs?: number
    /** True = pas de retry. Utile pour les calls longs (sinon une erreur
     * transitoire double le temps total) ou les calls où Moodle a déjà
     * fini son travail et un 2e appel le referait inutilement. */
    skipRetry?: boolean
  } = {},
): Promise<T> {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const url = `${cleanBase}/webservice/rest/server.php`
  const timeoutMs = opts.timeoutMs ?? 30000
  const maxAttempts = opts.skipRetry ? 1 : MOODLE_RETRY_ATTEMPTS

  const formData = new URLSearchParams()
  formData.set('wstoken', token)
  formData.set('wsfunction', wsfunction)
  formData.set('moodlewsrestformat', 'json')

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => formData.set(`${key}[${i}]`, String(v)))
    } else {
      formData.set(key, String(value))
    }
  }

  let lastErr: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: timeoutMs,
      })

      const data = response.data
      if (data && typeof data === 'object' && 'exception' in data) {
        // Erreur métier Moodle, ne pas retry
        throw new Error(
          `Moodle ${wsfunction}: ${data.errorcode ?? 'unknown'} — ${data.message ?? 'erreur inconnue'}`,
        )
      }
      return data as T
    } catch (err) {
      lastErr = err
      const transient = isTransientError(err)
      if (!transient || attempt >= maxAttempts) {
        throw err
      }
      // Retry après backoff
      await new Promise(resolve => setTimeout(resolve, MOODLE_RETRY_DELAY_MS))
    }
  }
  throw lastErr as Error
}

/**
 * Variante qui ne lève jamais. Si le call échoue (après retry), retourne `fallback`.
 * Le callback optionnel `onError` est appelé avec l'erreur — utile pour signaler à
 * l'audit appelant qu'un cours a été audité avec des données partielles.
 */
export async function safeMoodleCall<T>(
  baseUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number | string[] | number[]> = {},
  fallback: T,
  onError?: (err: Error, wsfunction: string) => void,
): Promise<T> {
  try {
    return await moodleCall<T>(baseUrl, token, wsfunction, params)
  } catch (err) {
    if (onError) onError(err as Error, wsfunction)
    return fallback
  }
}

export type MoodleSiteInfo = {
  sitename: string
  /** Nom d'utilisateur du compte qui détient le token webservice. */
  username: string
  firstname: string
  lastname: string
  fullname: string
  /** ID Moodle du compte du token. uid=2 ou uid=8 sont typiquement des admins. */
  userid: number
  /** True si le compte du token est administrateur principal Moodle. */
  userissiteadmin: boolean
  release: string
  version: string
  /** Liste des fonctions WS exposées au service ; chaque entrée a au minimum `name`. */
  functions: Array<{ name: string; version?: string }>
}

export async function getSiteInfo(baseUrl: string, token: string): Promise<MoodleSiteInfo> {
  return moodleCall<MoodleSiteInfo>(baseUrl, token, 'core_webservice_get_site_info')
}

export type UsersCountResult = {
  /** Total cumulé. null = toutes les méthodes ont échoué (voir errors[]). */
  total: number | null
  /** Détail par méthode d'auth, uniquement les méthodes ayant répondu avec >=1 user. */
  breakdown: Record<string, number>
  /** True si au moins une méthode a échoué (le total est donc une borne basse). */
  partial: boolean
  /** Messages d'erreur des méthodes qui ont échoué (utile pour debug admin). */
  errors: string[]
  /**
   * 'auth-list' = core_user_get_users sommé par méthode d'auth (compte tous
   *   les comptes, capability moodle/user:viewdetails requise).
   * 'enrolment' = somme distincte via core_enrol_get_enrolled_users sur tous
   *   les cours (compte uniquement les users inscrits dans ≥1 cours, fallback
   *   si la capability ci-dessus manque).
   */
  method: 'auth-list' | 'enrolment'
  /** Nombre de cours interrogés (uniquement pertinent en mode 'enrolment'). */
  nbCoursesScanned?: number
}

/** Méthodes d'auth Moodle à interroger. Surchargeable via MOODLE_AUTH_METHODS=man,oidc,ldap. */
const DEFAULT_AUTH_METHODS = ['manual', 'oidc']

function getAuthMethods(): string[] {
  const env = process.env.MOODLE_AUTH_METHODS
  if (!env) return DEFAULT_AUTH_METHODS
  const parsed = env
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : DEFAULT_AUTH_METHODS
}

/**
 * Compte les utilisateurs de la plateforme via core_user_get_users en SOMMANT
 * les requêtes par méthode d'auth (manual, oidc, etc.).
 *
 * Pourquoi cette stratégie : la doc Moodle accepte les keys
 * `id, firstname, lastname, idnumber, username, email, auth, confirmed`
 * Filtrer par `auth=manual` puis `auth=oidc` (les 2 méthodes UN-CHK) est
 * plus fiable que de faire un wildcard `lastname=''` (comportement non documenté).
 *
 * Robustesse : Promise.allSettled pour qu'un échec partiel ne fasse pas tout perdre.
 * Pagination Moodle : on passe `limitnum: 0` (= illimité côté serveur).
 *
 * Capability requise : `moodle/user:viewdetails` ET `moodle/user:viewalldetails`
 * sur le rôle du token. Sans elles, Moodle renvoie `accessexception` AVANT
 * l'exécution de la requête (peu importe le critère).
 *
 * Retourne TOUJOURS un objet (jamais null) :
 *   - total === null si toutes les méthodes ont échoué (admin a besoin de voir
 *     `errors[]` pour comprendre quoi corriger côté Moodle).
 *   - total === N si au moins une méthode a fulfilled (somme des succès).
 */
export async function getUsersTotalCount(
  baseUrl: string,
  token: string,
): Promise<UsersCountResult> {
  const methods = getAuthMethods()

  // On wrap chaque appel pour capter sa durée — sert à diagnostiquer les
  // timeouts PHP/proxy côté Moodle sur les très grosses plateformes.
  const results = await Promise.allSettled(
    methods.map(async method => {
      const t0 = Date.now()
      try {
        const response = await moodleCall<{ users?: Array<{ id: number }>; warnings?: unknown[] }>(
          baseUrl,
          token,
          'core_user_get_users',
          {
            'criteria[0][key]': 'auth',
            'criteria[0][value]': method,
            // ATTENTION : ne PAS passer limitnum/limitfrom — la signature de
            // core_user_get_users n'accepte QUE le paramètre `criteria[]`.
            // Tout paramètre supplémentaire (limitnum, limitfrom, etc.) déclenche
            // une `invalidparameter` qui annule tout l'appel.
            // Moodle renvoie alors tous les users matchant le critère sans limite.
          },
          {
            // Sur les grosses plateformes (~20K users via oidc), Moodle peut
            // mettre 60-180s à sérialiser tout le payload. On laisse 240s
            // (max_execution_time côté Moodle est censé être à 300s).
            // skipRetry car retry doublerait juste l'attente sans aider :
            // si Moodle a planté, il replantera.
            timeoutMs: 240_000,
            skipRetry: true,
          },
        )
        return { method, durationMs: Date.now() - t0, response }
      } catch (err) {
        // Re-throw avec contexte (method/duration) pour le tracking en aval.
        throw Object.assign(err as Error, { method, durationMs: Date.now() - t0 })
      }
    }),
  )

  const breakdown: Record<string, number> = {}
  const errors: string[] = []
  let total = 0
  let anyValidArray = false
  // Drapeau critique : true si AU MOINS UNE méthode a renvoyé une réponse
  // anormale (HTTP 200 mais pas de tableau `users`). Cause typique : payload
  // tronqué par max_execution_time PHP/Moodle ou par proxy en amont.
  // Quand c'est le cas, le total auth-list est forcément faux — on bascule
  // sur l'enrolment qui est paginé naturellement (1 cours = 1 call).
  let anyMalformed = false

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { method, durationMs, response } = r.value
      if (Array.isArray(response?.users)) {
        anyValidArray = true
        const count = response.users.length
        if (count > 0) {
          breakdown[method] = count
          total += count
        }
      } else {
        anyMalformed = true
        errors.push(
          `${method}: réponse Moodle invalide après ${durationMs}ms ` +
            `(probablement payload tronqué — max_execution_time PHP ou proxy)`,
        )
      }
    } else if (r.status === 'rejected') {
      const reason = r.reason as Error & { method?: string; durationMs?: number }
      const method = reason.method ?? 'inconnu'
      const ms = reason.durationMs ?? 0
      errors.push(`${method} (${ms}ms): ${(reason.message ?? String(reason)).slice(0, 180)}`)
    }
  }

  // Déclenchement du fallback dès qu'une méthode n'a PAS répondu proprement :
  //   - rejected (timeout réseau ECONNABORTED, accessexception Moodle, etc.)
  //   - fulfilled-malformed (payload tronqué par max_execution_time PHP)
  //   - aucune méthode n'a renvoyé un tableau valide
  // Critère : `errors.length > 0` couvre les deux premiers ; `!anyValidArray`
  // couvre le 3e (toutes ont planté).
  //
  // Pourquoi strict : si une seule méthode plante, le total est forcément
  // sous-estimé (cf. P13 LSHE où manual=7 mais oidc devait remonter ~20000).
  // Le fallback enrolment est paginé naturellement (1 cours = 1 appel) donc
  // robuste même sur les grosses plateformes.
  if (errors.length > 0 || !anyValidArray) {
    logger.info(
      {
        baseUrl,
        errors,
        methods,
        reason: anyMalformed ? 'malformed' : !anyValidArray ? 'no-valid-array' : 'partial-failure',
      },
      'getUsersTotalCount : auth-list incomplet, fallback enrolment',
    )
    try {
      const fb = await countDistinctEnrolledUsers(baseUrl, token)
      return {
        total: fb.total,
        breakdown: { 'enrôlés (≥1 cours)': fb.total ?? 0 },
        partial: fb.partial,
        errors: [...errors.slice(0, 2), ...fb.errors.slice(0, 3)],
        method: 'enrolment',
        nbCoursesScanned: fb.nbCoursesScanned,
      }
    } catch (err) {
      logger.warn(
        { baseUrl, err: (err as Error).message },
        'getUsersTotalCount : fallback enrolment a échoué aussi',
      )
      return {
        total: null,
        breakdown,
        partial: false,
        errors: [...errors, `fallback enrolment: ${(err as Error).message.slice(0, 150)}`],
        method: 'auth-list',
      }
    }
  }

  return {
    total,
    breakdown,
    partial: errors.length > 0,
    errors,
    method: 'auth-list',
  }
}

/**
 * Fallback : compte les utilisateurs DISTINCTS inscrits dans ≥1 cours via
 * core_enrol_get_enrolled_users. Utilisé quand core_user_get_users n'a pas
 * la capability moodle/user:viewdetails sur le token.
 *
 * Capability requise : `moodle/course:viewparticipants` (souvent accordée par
 * défaut au rôle enseignant/admin, donc plus permissive que viewdetails).
 *
 * Coût : 1 appel par cours, parallélisé (10 simultanés). Pour 400 cours :
 * ~5-10 secondes. On passe `userfields=id` pour réduire chaque payload de
 * ~22× (240 user × id-only ≈ 11 KB au lieu de ~250 KB avec full profile).
 *
 * Limite connue : ne compte PAS les comptes admins/techniques jamais inscrits
 * dans un cours. Pour une plateforme universitaire normale, l'écart est <1%.
 */
async function countDistinctEnrolledUsers(
  baseUrl: string,
  token: string,
): Promise<{
  total: number | null
  partial: boolean
  errors: string[]
  nbCoursesScanned: number
}> {
  const courses = await getCourses(baseUrl, token)
  // Le cours id=1 est le "Site Course" Moodle (page d'accueil), pas un vrai cours
  const realCourses = courses.filter(c => c.id !== 1)

  if (realCourses.length === 0) {
    return { total: 0, partial: false, errors: [], nbCoursesScanned: 0 }
  }

  const limit = pLimit(10)
  const userIds = new Set<number>()
  const errors: string[] = []

  await Promise.all(
    realCourses.map(c =>
      limit(async () => {
        try {
          const users = await moodleCall<Array<{ id: number }>>(
            baseUrl,
            token,
            'core_enrol_get_enrolled_users',
            {
              courseid: c.id,
              'options[0][name]': 'userfields',
              'options[0][value]': 'id',
            },
          )
          if (Array.isArray(users)) {
            for (const u of users) {
              if (typeof u.id === 'number') userIds.add(u.id)
            }
          }
        } catch (err) {
          const msg = (err as Error).message ?? 'erreur inconnue'
          // Cap à 10 erreurs collectées (pour ne pas exploser en mémoire si
          // la capability manque aussi côté enrolment → 400 erreurs identiques).
          if (errors.length < 10) errors.push(`cours ${c.id}: ${msg.slice(0, 150)}`)
        }
      }),
    ),
  )

  // Si TOUS les cours ont échoué, c'est probablement encore un accessexception
  // (capability moodle/course:viewparticipants manquante aussi). On remonte null
  // pour que l'UI puisse afficher le bon message d'erreur.
  if (userIds.size === 0 && errors.length === realCourses.length) {
    return {
      total: null,
      partial: false,
      errors,
      nbCoursesScanned: realCourses.length,
    }
  }

  return {
    total: userIds.size,
    partial: errors.length > 0,
    errors,
    nbCoursesScanned: realCourses.length,
  }
}

export type MoodleCourse = {
  id: number
  fullname: string
  shortname: string
  idnumber?: string
  categoryid?: number
  categoryname?: string
  summary?: string
  visible?: number
  timecreated?: number
  timemodified?: number
  startdate?: number
  enddate?: number
  overviewfiles?: Array<{ fileurl?: string; mimetype?: string }>
}

// TTL court : la liste de cours bouge plus souvent que les catégories.
// 5 min suffit à mutualiser des audits parallèles lancés en rafale.
const GET_COURSES_TTL_SEC = 300

export async function getCourses(
  baseUrl: string,
  token: string,
  opts?: { bypassCache?: boolean },
): Promise<MoodleCourse[]> {
  const key = cacheKey('core_course_get_courses', baseUrl, token)
  if (!opts?.bypassCache) {
    const cached = await readCached<MoodleCourse[]>(key)
    if (cached) return cached
  }
  const data = await moodleCall<MoodleCourse[]>(baseUrl, token, 'core_course_get_courses')
  const courses = Array.isArray(data) ? data.filter(c => (c.id ?? 0) > 1) : []
  await writeCached(key, courses, GET_COURSES_TTL_SEC)
  return courses
}

export async function getCoursesByField(
  baseUrl: string,
  token: string,
  field: 'id' | 'ids' | 'shortname' | 'idnumber' | 'category',
  value: string | number,
): Promise<MoodleCourse[]> {
  const result = await safeMoodleCall<{ courses?: MoodleCourse[] }>(
    baseUrl,
    token,
    'core_course_get_courses_by_field',
    { field, value: String(value) },
    {},
  )
  return result.courses ?? []
}

export type MoodleCategory = {
  id: number
  name: string
  parent: number
  path: string
  depth: number
  coursecount: number
  children: number[]
}

export type CategoriesTree = Record<number, MoodleCategory>

// TTL long : les catégories Moodle bougent rarement (création/refonte annuelle).
// 30 min mutualise sans risquer une donnée obsolète.
const GET_CATEGORIES_TREE_TTL_SEC = 1800

export async function getCategoriesTree(
  baseUrl: string,
  token: string,
  opts?: { bypassCache?: boolean },
): Promise<CategoriesTree> {
  const key = cacheKey('core_course_get_categories', baseUrl, token)
  if (!opts?.bypassCache) {
    const cached = await readCached<CategoriesTree>(key)
    if (cached) return cached
  }

  const cats = await safeMoodleCall<any[]>(
    baseUrl,
    token,
    'core_course_get_categories',
    { addsubcategories: 1 },
    [],
  )
  if (!Array.isArray(cats)) return {}

  const tree: CategoriesTree = {}
  for (const cat of cats) {
    const cid = Number(cat.id)
    if (!cid) continue
    tree[cid] = {
      id: cid,
      name: String(cat.name ?? ''),
      parent: Number(cat.parent ?? 0),
      path: String(cat.path ?? ''),
      depth: Number(cat.depth ?? 1),
      coursecount: Number(cat.coursecount ?? 0),
      children: [],
    }
  }
  for (const cid of Object.keys(tree)) {
    const cat = tree[Number(cid)]
    if (cat.parent && tree[cat.parent]) tree[cat.parent].children.push(cat.id)
  }
  await writeCached(key, tree, GET_CATEGORIES_TREE_TTL_SEC)
  return tree
}

export function getCategoryPath(catId: number, tree: CategoriesTree): string[] {
  const path: string[] = []
  const visited = new Set<number>()
  let current = catId
  while (current && tree[current] && !visited.has(current)) {
    visited.add(current)
    path.unshift(tree[current].name)
    current = tree[current].parent
  }
  return path
}

export type MoodleSection = {
  id: number
  name: string
  summary: string
  section?: number
  modules: MoodleModule[]
}

export type MoodleModule = {
  id: number
  name: string
  modname: string
  description?: string
  url?: string
  visible?: number
  completion?: number
  timemodified?: number
  contents?: Array<{
    type?: string
    filename?: string
    filesize?: number
    fileurl?: string
    mimetype?: string
  }>
}

export type OnMoodleError = (err: Error, wsfunction: string) => void

export async function getCourseContents(
  baseUrl: string,
  token: string,
  courseId: number,
  onError?: OnMoodleError,
): Promise<MoodleSection[]> {
  return safeMoodleCall<MoodleSection[]>(
    baseUrl,
    token,
    'core_course_get_contents',
    { courseid: courseId },
    [],
    onError,
  )
}

export type MoodleEnrolledUser = {
  id: number
  fullname: string
  email?: string
  profileimageurl?: string
  lastcourseaccess?: number
  roles?: Array<{ shortname: string; name?: string }>
}

export async function getEnrolledUsers(
  baseUrl: string,
  token: string,
  courseId: number,
  onError?: OnMoodleError,
): Promise<MoodleEnrolledUser[]> {
  return safeMoodleCall<MoodleEnrolledUser[]>(
    baseUrl,
    token,
    'core_enrol_get_enrolled_users',
    { courseid: courseId },
    [],
    onError,
  )
}

export type MoodleQuiz = {
  id: number
  name: string
  grade?: number
  sumgrades?: number
  questioncount?: number
  numattempts?: number
  attempts?: number
  timelimit?: number
}

export async function getQuizzes(
  baseUrl: string,
  token: string,
  courseId: number,
  onError?: OnMoodleError,
): Promise<MoodleQuiz[]> {
  const data = await safeMoodleCall<{ quizzes?: MoodleQuiz[] }>(
    baseUrl,
    token,
    'mod_quiz_get_quizzes_by_courses',
    { courseids: [courseId] },
    {},
    onError,
  )
  return data.quizzes ?? []
}

export type MoodleQuizAttempt = {
  id: number
  userid: number
  state: string
  sumgrades?: number | null
  questions?: any[]
}

export async function getQuizAttempts(
  baseUrl: string,
  token: string,
  quizId: number,
  onError?: OnMoodleError,
): Promise<MoodleQuizAttempt[]> {
  const r1 = await safeMoodleCall<{ attempts?: MoodleQuizAttempt[] }>(
    baseUrl,
    token,
    'mod_quiz_get_user_attempts',
    { quizid: quizId, status: 'all', includepreviews: 0 },
    {},
    onError,
  )
  if (r1.attempts && r1.attempts.length) return r1.attempts
  const r2 = await safeMoodleCall<{ attempts?: MoodleQuizAttempt[] }>(
    baseUrl,
    token,
    'mod_quiz_get_user_attempts',
    { quizid: quizId, userid: 0, status: 'all', includepreviews: 0 },
    {},
    onError,
  )
  return r2.attempts ?? []
}

export async function getQuizAccessInfo(
  baseUrl: string,
  token: string,
  quizId: number,
  onError?: OnMoodleError,
): Promise<Record<string, any>> {
  return safeMoodleCall<Record<string, any>>(
    baseUrl,
    token,
    'mod_quiz_get_quiz_access_information',
    { quizid: quizId },
    {},
    onError,
  )
}

export type CompletionData = {
  statuses?: Array<{ cmid: number; state: number }>
}

export async function getCompletion(
  baseUrl: string,
  token: string,
  courseId: number,
  onError?: OnMoodleError,
): Promise<CompletionData | null> {
  return safeMoodleCall<CompletionData | null>(
    baseUrl,
    token,
    'core_completion_get_activities_completion_status',
    { courseid: courseId, userid: 0 },
    null,
    onError,
  )
}

export async function fetchImageBytes(
  url: string,
  token: string,
): Promise<Buffer | null> {
  try {
    const sep = url.includes('?') ? '&' : '?'
    const res = await axios.get(`${url}${sep}token=${token}`, {
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: () => true,
    })
    if (res.status !== 200) return null
    const ct = String(res.headers['content-type'] ?? '')
    if (!ct.startsWith('image/')) return null
    const buf = Buffer.from(res.data)
    if (buf.length < 1000) return null
    return buf
  } catch {
    return null
  }
}

export function extractImageUrlsFromHtml(html: string, baseUrl: string): string[] {
  if (!html) return []
  const $ = cheerio.load(html)
  const urls: string[] = []
  $('img').each((_, el) => {
    const src = $(el).attr('src')
    if (!src) return
    const absolute = src.startsWith('http')
      ? src
      : `${baseUrl.replace(/\/+$/, '')}/${src.replace(/^\/+/, '')}`
    urls.push(absolute)
  })
  return urls
}

export async function getCourseImages(
  baseUrl: string,
  token: string,
  courseId: number,
  contents: MoodleSection[],
  maxImages = 5,
): Promise<Buffer[]> {
  const images: Buffer[] = []
  const seen = new Set<string>()

  const tryAdd = async (rawUrl?: string) => {
    if (!rawUrl) return
    if (seen.has(rawUrl)) return
    if (images.length >= maxImages) return
    seen.add(rawUrl)
    const buf = await fetchImageBytes(rawUrl, token)
    if (buf) images.push(buf)
  }

  const courseInfo = await getCoursesByField(baseUrl, token, 'id', courseId)
  const overview = courseInfo[0]?.overviewfiles ?? []
  for (const f of overview) {
    if (images.length >= maxImages) break
    await tryAdd(f.fileurl)
  }

  const sectionsOrdered = [...contents].sort((a, b) => (a.section ?? 99) - (b.section ?? 99))
  for (const sec of sectionsOrdered) {
    if (images.length >= maxImages) break
    for (const mod of sec.modules ?? []) {
      if (images.length >= maxImages) break
      if (mod.modname === 'label') {
        const urls = extractImageUrlsFromHtml(mod.description ?? '', baseUrl)
        for (const u of urls) {
          if (images.length >= maxImages) break
          await tryAdd(u)
        }
      }
      for (const c of mod.contents ?? []) {
        if (images.length >= maxImages) break
        if ((c.mimetype ?? '').startsWith('image/')) await tryAdd(c.fileurl)
      }
    }
  }

  return images
}

export function stripHtml(html: string | undefined | null): string {
  if (!html) return ''
  const $ = cheerio.load(html)
  return $.root().text().replace(/\s+/g, ' ').trim()
}

// ─── Cours d'un utilisateur (par email) ──────────────────────────────────
//
// Utilisé par la page /me/courses : pour chaque plateforme configurée, on
// résout l'email Keycloak → userid Moodle, puis on liste ses cours.
// On garde un cache court (5 min) : l'enrôlement bouge rarement à l'échelle
// d'une session de travail, et ça évite de spammer les WS si l'utilisateur
// rafraîchit la page.

export type MoodleUserCourse = {
  id: number
  shortname: string
  fullname: string
  visible: number
  enrolledusercount?: number
  /** ID de la catégorie Moodle (à résoudre en nom via getCategoriesTree). */
  category?: number
  /** Timestamp Unix de création du cours, si Moodle le renvoie. */
  timecreated?: number
  /** Rôles de l'utilisateur dans ce cours, si Moodle les renvoie. */
  roles?: Array<{ roleid: number; shortname: string; name: string }>
}

const GET_USER_COURSES_TTL_SEC = 300

/**
 * Résout un email vers un userid Moodle via core_user_get_users_by_field.
 * Retourne null si aucun compte ne porte cet email (cas fréquent : un Personnel
 * UN-CHK qui n'a pas encore de compte sur cette plateforme Moodle particulière).
 */
export async function getMoodleUserIdByEmail(
  baseUrl: string,
  token: string,
  email: string,
): Promise<number | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const users = await safeMoodleCall<Array<{ id: number; email?: string }>>(
    baseUrl,
    token,
    'core_user_get_users_by_field',
    { field: 'email', values: [normalized] },
    [],
  )
  if (!Array.isArray(users) || users.length === 0) return null
  // Moodle peut retourner plusieurs résultats si plusieurs comptes ont le même
  // email (cas exotique). On prend le premier — c'est le plus ancien.
  return users[0].id ?? null
}

export type UserCoursesResult = {
  courses: MoodleUserCourse[]
  /**
   * true si Moodle a répondu par une exception `webservice_access_exception`.
   * Cas typique : la fonction `core_enrol_get_users_courses` n'a pas été
   * ajoutée au service Web externe côté admin Moodle. À afficher clairement
   * à l'utilisateur — sinon il voit "0 cours" sans comprendre pourquoi.
   */
  accessDenied?: boolean
  /** Message d'erreur brut Moodle (si un problème s'est produit). */
  error?: string
}

/**
 * Liste les cours dans lesquels un utilisateur Moodle est enrôlé.
 * Le filtre par rôle (enseignant/tuteur uniquement) est appliqué côté client
 * uniquement si la réponse inclut `roles[]` — sinon on retourne tout et
 * c'est l'appelant qui décide.
 *
 * Retourne un objet structuré avec `accessDenied`/`error` pour permettre à
 * l'UI de distinguer "aucun cours" (liste vide légitime) de "WS refusé"
 * (config manquante côté Moodle).
 */
export async function getUserEnrolledCourses(
  baseUrl: string,
  token: string,
  userid: number,
  opts?: { teacherOnly?: boolean; bypassCache?: boolean },
): Promise<UserCoursesResult> {
  const cacheK = cacheKey('core_enrol_get_users_courses', baseUrl, `u${userid}`)
  if (!opts?.bypassCache) {
    const cached = await readCached<MoodleUserCourse[]>(cacheK)
    if (cached) return { courses: filterCoursesByRole(cached, opts?.teacherOnly) }
  }
  try {
    const courses = await moodleCall<MoodleUserCourse[]>(
      baseUrl,
      token,
      'core_enrol_get_users_courses',
      { userid, returnusercount: 0 },
    )
    const list = Array.isArray(courses) ? courses : []
    await writeCached(cacheK, list, GET_USER_COURSES_TTL_SEC)
    return { courses: filterCoursesByRole(list, opts?.teacherOnly) }
  } catch (err) {
    const message = (err as Error).message
    // La fonction WS n'est pas activée côté Moodle → on remonte le drapeau
    // pour que l'UI affiche un message actionnable au lieu de "0 cours".
    const isAccessDenied = /accessexception|access to the function/i.test(message)
    return {
      courses: [],
      accessDenied: isAccessDenied,
      error: message.slice(0, 300),
    }
  }
}

/**
 * Rôles Moodle "pédagogiques" : editingteacher (3) = enseignant éditeur,
 * teacher (4) = tuteur. On filtre par shortname plutôt que roleid car les
 * roleids peuvent varier d'une plateforme à l'autre.
 */
const TEACHER_ROLE_SHORTNAMES = new Set(['editingteacher', 'teacher'])

function filterCoursesByRole(
  courses: MoodleUserCourse[],
  teacherOnly?: boolean,
): MoodleUserCourse[] {
  if (!teacherOnly) return courses
  return courses.filter(c => {
    if (!Array.isArray(c.roles) || c.roles.length === 0) {
      // Si Moodle ne renvoie pas les rôles, on garde le cours (impossible de
      // filtrer sans info) — c'est plus utile pour l'utilisateur que de cacher.
      return true
    }
    return c.roles.some(r => TEACHER_ROLE_SHORTNAMES.has(r.shortname))
  })
}

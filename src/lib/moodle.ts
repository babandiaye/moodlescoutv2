import axios from 'axios'
import * as cheerio from 'cheerio'

export async function moodleCall<T = any>(
  baseUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number | string[] | number[]> = {},
): Promise<T> {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const url = `${cleanBase}/webservice/rest/server.php`

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

  const response = await axios.post(url, formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  })

  const data = response.data
  if (data && typeof data === 'object' && 'exception' in data) {
    throw new Error(
      `Moodle ${wsfunction}: ${data.errorcode ?? 'unknown'} — ${data.message ?? 'erreur inconnue'}`,
    )
  }
  return data as T
}

export async function safeMoodleCall<T>(
  baseUrl: string,
  token: string,
  wsfunction: string,
  params: Record<string, string | number | string[] | number[]> = {},
  fallback: T,
): Promise<T> {
  try {
    return await moodleCall<T>(baseUrl, token, wsfunction, params)
  } catch {
    return fallback
  }
}

export type MoodleSiteInfo = {
  sitename: string
  username: string
  firstname: string
  lastname: string
  fullname: string
  release: string
  version: string
}

export async function getSiteInfo(baseUrl: string, token: string): Promise<MoodleSiteInfo> {
  return moodleCall<MoodleSiteInfo>(baseUrl, token, 'core_webservice_get_site_info')
}

/**
 * Tente d'estimer le nombre d'utilisateurs de la plateforme via core_user_get_users.
 * Le critère lastname='' fait un LIKE '%%' qui matche tous les comptes côté Moodle.
 * Nécessite la capability moodle/user:viewalldetails sur le rôle du token Web Services.
 * Retourne `null` si la fonction n'est pas accessible (token sans droit, plugin absent, etc.).
 */
export async function getUsersTotalCount(
  baseUrl: string,
  token: string,
): Promise<number | null> {
  try {
    const res = await moodleCall<{ users?: Array<{ id: number }>; warnings?: unknown[] }>(
      baseUrl,
      token,
      'core_user_get_users',
      {
        'criteria[0][key]': 'lastname',
        'criteria[0][value]': '',
      },
    )
    if (!res || !Array.isArray(res.users)) return null
    return res.users.length
  } catch {
    return null
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

export async function getCourses(baseUrl: string, token: string): Promise<MoodleCourse[]> {
  const data = await moodleCall<MoodleCourse[]>(baseUrl, token, 'core_course_get_courses')
  return Array.isArray(data) ? data.filter(c => (c.id ?? 0) > 1) : []
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

export async function getCategoriesTree(baseUrl: string, token: string): Promise<CategoriesTree> {
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

export async function getCourseContents(
  baseUrl: string,
  token: string,
  courseId: number,
): Promise<MoodleSection[]> {
  return safeMoodleCall<MoodleSection[]>(
    baseUrl,
    token,
    'core_course_get_contents',
    { courseid: courseId },
    [],
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
): Promise<MoodleEnrolledUser[]> {
  return safeMoodleCall<MoodleEnrolledUser[]>(
    baseUrl,
    token,
    'core_enrol_get_enrolled_users',
    { courseid: courseId },
    [],
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
): Promise<MoodleQuiz[]> {
  const data = await safeMoodleCall<{ quizzes?: MoodleQuiz[] }>(
    baseUrl,
    token,
    'mod_quiz_get_quizzes_by_courses',
    { courseids: [courseId] },
    {},
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
): Promise<MoodleQuizAttempt[]> {
  const r1 = await safeMoodleCall<{ attempts?: MoodleQuizAttempt[] }>(
    baseUrl,
    token,
    'mod_quiz_get_user_attempts',
    { quizid: quizId, status: 'all', includepreviews: 0 },
    {},
  )
  if (r1.attempts && r1.attempts.length) return r1.attempts
  const r2 = await safeMoodleCall<{ attempts?: MoodleQuizAttempt[] }>(
    baseUrl,
    token,
    'mod_quiz_get_user_attempts',
    { quizid: quizId, userid: 0, status: 'all', includepreviews: 0 },
    {},
  )
  return r2.attempts ?? []
}

export async function getQuizAccessInfo(
  baseUrl: string,
  token: string,
  quizId: number,
): Promise<Record<string, any>> {
  return safeMoodleCall<Record<string, any>>(
    baseUrl,
    token,
    'mod_quiz_get_quiz_access_information',
    { quizid: quizId },
    {},
  )
}

export type CompletionData = {
  statuses?: Array<{ cmid: number; state: number }>
}

export async function getCompletion(
  baseUrl: string,
  token: string,
  courseId: number,
): Promise<CompletionData | null> {
  return safeMoodleCall<CompletionData | null>(
    baseUrl,
    token,
    'core_completion_get_activities_completion_status',
    { courseid: courseId, userid: 0 },
    null,
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

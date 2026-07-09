import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { getCoursesByField, type MoodleCourse } from '@/lib/moodle'

/**
 * Résolution d'un input utilisateur ("URL de cours", "shortname", "id numérique")
 * vers un couple (platformId, courseId) exploitable par le pipeline d'audit.
 *
 * Utilisé par la nouvelle route /audits/course pour permettre à un utilisateur
 * de lancer un audit sur UN cours précis sans passer par /me/courses ou par
 * l'audit global d'une plateforme.
 */

export type ResolveMatch = {
  platformId: string
  platformName: string
  platformUrl: string
  courseId: number
  shortname: string
  fullname: string
}

export type ResolveResult =
  | { ok: true; matches: ResolveMatch[]; input: string; kind: 'url' | 'shortname' | 'id' }
  | { ok: false; error: string; input: string }

/**
 * Parse un input libre :
 *   - "https://p1369rlshepw.unchk.sn/course/view.php?id=981" → URL directe
 *   - "SOCIO1261" ou "UN-SOCIO/INFO" → shortname
 *   - "981" → id numérique (recherche multi-plateformes)
 *
 * Retourne 0..N matches. L'appelant choisit s'il en garde un ou plusieurs.
 */
export async function resolveCourseInput(rawInput: string): Promise<ResolveResult> {
  const input = rawInput.trim()
  if (!input) return { ok: false, error: 'Entrée vide', input }

  // 1) URL type Moodle standard
  const urlMatch = input.match(/^https?:\/\/([^/]+)\/course\/view\.php\?id=(\d+)/i)
  if (urlMatch) {
    const domain = urlMatch[1].toLowerCase()
    const courseId = parseInt(urlMatch[2], 10)
    return await resolveUrl(input, domain, courseId)
  }

  // 2) ID numérique pur → cherche sur toutes les plateformes
  if (/^\d+$/.test(input)) {
    return await resolveByField(input, 'id', input, 'id')
  }

  // 3) Sinon : shortname
  return await resolveByField(input, 'shortname', input, 'shortname')
}

async function resolveUrl(
  input: string,
  domain: string,
  courseId: number,
): Promise<ResolveResult> {
  const platforms = await prisma.moodlePlatform.findMany({
    where: { isActive: true },
    select: { id: true, name: true, url: true, tokenEnc: true },
  })
  // Match par domaine — normalisation basique (retire trailing slash, protocole).
  const platform = platforms.find(p => {
    try {
      const u = new URL(p.url)
      return u.hostname.toLowerCase() === domain
    } catch {
      return false
    }
  })
  if (!platform) {
    return {
      ok: false,
      error: `Aucune plateforme configurée ne correspond au domaine "${domain}". Ajoutez-la via /configuration.`,
      input,
    }
  }
  try {
    const token = decrypt(platform.tokenEnc)
    const courses = await getCoursesByField(platform.url, token, 'id', courseId)
    if (courses.length === 0) {
      return {
        ok: false,
        error: `Cours id=${courseId} introuvable sur ${platform.name}.`,
        input,
      }
    }
    return {
      ok: true,
      kind: 'url',
      input,
      matches: courses.map(c => ({
        platformId: platform.id,
        platformName: platform.name,
        platformUrl: platform.url,
        courseId: Number(c.id),
        shortname: String(c.shortname ?? ''),
        fullname: String(c.fullname ?? ''),
      })),
    }
  } catch (err) {
    return { ok: false, error: `Erreur Moodle : ${(err as Error).message.slice(0, 200)}`, input }
  }
}

async function resolveByField(
  input: string,
  moodleField: 'id' | 'shortname',
  value: string,
  kind: 'id' | 'shortname',
): Promise<ResolveResult> {
  const platforms = await prisma.moodlePlatform.findMany({
    where: { isActive: true },
    select: { id: true, name: true, url: true, tokenEnc: true },
  })
  if (platforms.length === 0) {
    return { ok: false, error: 'Aucune plateforme configurée.', input }
  }

  // Recherche parallèle sur toutes les plateformes. Un shortname peut exister
  // sur plusieurs plateformes ; on renvoie tous les matches et l'UI choisit.
  const results = await Promise.all(
    platforms.map(async p => {
      try {
        const token = decrypt(p.tokenEnc)
        const courses = await getCoursesByField(p.url, token, moodleField, value)
        return { platform: p, courses }
      } catch {
        // Une plateforme injoignable ne bloque pas les autres.
        return { platform: p, courses: [] as MoodleCourse[] }
      }
    }),
  )

  const matches: ResolveMatch[] = []
  for (const r of results) {
    for (const c of r.courses) {
      matches.push({
        platformId: r.platform.id,
        platformName: r.platform.name,
        platformUrl: r.platform.url,
        courseId: Number(c.id),
        shortname: String(c.shortname ?? ''),
        fullname: String(c.fullname ?? ''),
      })
    }
  }

  if (matches.length === 0) {
    const label = kind === 'id' ? `ID ${input}` : `shortname "${input}"`
    return { ok: false, error: `Aucun cours trouvé avec ${label} sur les plateformes configurées.`, input }
  }
  return { ok: true, kind, input, matches }
}

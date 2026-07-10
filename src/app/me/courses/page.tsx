import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { canLaunchAudit } from '@/lib/permissions'
import {
  getCategoriesTree,
  getMoodleUserIdByEmail,
  getUserEnrolledCourses,
  type CategoriesTree,
  type MoodleUserCourse,
} from '@/lib/moodle'
import { MyCoursesList, type CourseRow, type PlatformOption } from '@/components/my-courses-list'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Props = { searchParams: Promise<{ refresh?: string }> }

export default async function MyCoursesPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const email = session.user.email ?? ''
  const canLaunch = canLaunchAudit(session.user.role)
  const sp = await searchParams
  const bypassCache = sp.refresh === '1'

  if (!email) {
    return (
      <EmptyBanner
        title="Email manquant sur votre compte"
        description="Votre profil Keycloak n'a pas d'email associé. Contactez la DITSI pour le corriger."
      />
    )
  }

  const platforms = await prisma.moodlePlatform.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, url: true, tokenEnc: true },
  })

  if (platforms.length === 0) {
    return (
      <EmptyBanner
        title="Aucune plateforme configurée"
        description="Demandez à un administrateur d'ajouter une plateforme Moodle dans la Configuration."
      />
    )
  }

  // Fetch en parallèle (une plateforme HS ne casse pas les autres)
  const perPlatform = await Promise.all(
    platforms.map(async p => {
      try {
        const token = decrypt(p.tokenEnc)
        const userid = await getMoodleUserIdByEmail(p.url, token, email)
        if (!userid) {
          return { ok: true as const, platform: p, courses: [] as MoodleUserCourse[], tree: {} as CategoriesTree, hadError: false }
        }
        // Fetch courses + categories tree en parallèle
        const [coursesRes, tree] = await Promise.all([
          getUserEnrolledCourses(p.url, token, userid, { teacherOnly: true, bypassCache }),
          getCategoriesTree(p.url, token).catch(() => ({} as CategoriesTree)),
        ])
        return {
          ok: true as const,
          platform: p,
          courses: coursesRes.courses,
          tree,
          hadError: !!coursesRes.accessDenied || !!coursesRes.error,
        }
      } catch {
        return { ok: false as const, platform: p, courses: [] as MoodleUserCourse[], tree: {} as CategoriesTree, hadError: true }
      }
    }),
  )

  // Aplatir en CourseRow[] pour le client
  const platformOptions: PlatformOption[] = platforms.map(p => ({ id: p.id, name: p.name }))
  const rows: CourseRow[] = []
  for (const r of perPlatform) {
    for (const c of r.courses) {
      const role = deriveRole(c.roles)
      const categoryName = c.category && r.tree[c.category] ? r.tree[c.category].name : null
      const platformUrlNoSlash = r.platform.url.replace(/\/+$/, '')
      rows.push({
        key: `${r.platform.id}-${c.id}`,
        courseId: c.id,
        shortname: c.shortname,
        fullname: c.fullname,
        visible: c.visible === 1,
        categoryName,
        timecreated: c.timecreated ?? null,
        role,
        platform: { id: r.platform.id, name: r.platform.name, url: r.platform.url },
        auditsCount: 0,
        lastAuditAt: null,
        moodleHref: `${platformUrlNoSlash}/course/view.php?id=${c.id}`,
        auditHref: `/audits/new?platform=${encodeURIComponent(r.platform.id)}&courses=${c.id}`,
      })
    }
  }

  // Enrichissement audits (BD) : nb audits + dernier audit par (platform, course)
  if (rows.length > 0) {
    const platformIds = Array.from(new Set(rows.map(r => r.platform.id)))
    const courseIds = Array.from(new Set(rows.map(r => r.courseId)))
    type AggRow = { platform_id: string; course_id: number; n: number; last_at: Date }
    const aggs = await prisma.$queryRaw<AggRow[]>`
      SELECT s.platform_id, ca.course_id, COUNT(*)::int AS n, MAX(ca.created_at) AS last_at
      FROM course_audits ca
      INNER JOIN audit_sessions s ON s.id = ca.session_id
      WHERE ca.error_message IS NULL
        AND s.platform_id IN (${Prisma.join(platformIds)})
        AND ca.course_id IN (${Prisma.join(courseIds)})
      GROUP BY s.platform_id, ca.course_id
    `
    const map = new Map<string, AggRow>()
    for (const a of aggs) map.set(`${a.platform_id}-${a.course_id}`, a)
    for (const row of rows) {
      const a = map.get(row.key)
      if (a) {
        row.auditsCount = a.n
        row.lastAuditAt = a.last_at.toISOString()
      }
    }
  }

  const nbPlateformesAvecCours = new Set(rows.map(r => r.platform.id)).size

  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">
            <BookOpenIcon width={22} height={22} style={{ verticalAlign: 'middle', color: 'var(--brand)', marginRight: 6 }} />
            Mes cours
          </h1>
          <p className="page-subtitle">
            Consultez et auditez les cours dans lesquels vous enseignez ou êtes tuteur sur vos plateformes Moodle.
          </p>
        </div>
        <div className="page-title-actions" style={{ gap: 8 }}>
          <span className="chip-info blue">{nbPlateformesAvecCours} plateforme(s)</span>
          <span className="chip-info green">{rows.length} cours</span>
          <a
            href="/me/courses?refresh=1"
            className="btn btn-secondary"
            title="Ignorer le cache 5 min et re-interroger Moodle"
          >
            <RefreshIcon /> Rafraîchir
          </a>
        </div>
      </div>

      <MyCoursesList
        initial={rows}
        platforms={platformOptions}
        canLaunch={canLaunch}
      />
    </>
  )
}

function deriveRole(roles?: MoodleUserCourse['roles']): CourseRow['role'] {
  if (!Array.isArray(roles) || roles.length === 0) return 'autre'
  if (roles.some(r => r.shortname === 'editingteacher')) return 'enseignant'
  if (roles.some(r => r.shortname === 'teacher')) return 'tuteur'
  return 'autre'
}

function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  )
}

function EmptyBanner({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">Mes cours</h1>
          <p className="page-subtitle">
            Consultez et auditez les cours dans lesquels vous enseignez ou êtes tuteur sur vos plateformes Moodle.
          </p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <h3 style={{ fontSize: 15, margin: 0, marginBottom: 6 }}>{title}</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{description}</p>
        </div>
      </div>
    </>
  )
}

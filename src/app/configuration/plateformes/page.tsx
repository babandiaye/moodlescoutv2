import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ServerStackIcon,
  CpuChipIcon,
  BuildingLibraryIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PlatformsSection } from '@/components/platforms-section'
import { isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type AggRow = {
  platform_id: string
  nb_audits: number
  nb_audited_courses: number
}

export default async function ConfigurationPlateformesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin(session.user.role)) redirect('/')

  const [platforms, aggRows] = await Promise.all([
    prisma.moodlePlatform.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, url: true, version: true, isActive: true, createdAt: true },
    }),
    prisma.$queryRaw<AggRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (s.platform_id, ca.course_id) s.platform_id, ca.course_id
        FROM course_audits ca
        INNER JOIN audit_sessions s ON s.id = ca.session_id
        WHERE ca.error_message IS NULL
        ORDER BY s.platform_id, ca.course_id, ca.created_at DESC
      ),
      audits_per_platform AS (
        SELECT platform_id, COUNT(*)::int AS nb_audits FROM audit_sessions GROUP BY platform_id
      )
      SELECT
        p.id AS platform_id,
        COALESCE(a.nb_audits, 0) AS nb_audits,
        COALESCE(l.n, 0) AS nb_audited_courses
      FROM moodle_platforms p
      LEFT JOIN audits_per_platform a ON a.platform_id = p.id
      LEFT JOIN (
        SELECT platform_id, COUNT(*)::int AS n FROM latest GROUP BY platform_id
      ) l ON l.platform_id = p.id
    `,
  ])

  const aggMap = new Map<string, AggRow>()
  for (const a of aggRows) aggMap.set(a.platform_id, a)

  const nbTotal = platforms.length
  const nbActive = platforms.filter(p => p.isActive).length
  const nbInactive = nbTotal - nbActive
  const nbAudits = aggRows.reduce((s, a) => s + a.nb_audits, 0)
  const nbCoursesAudited = aggRows.reduce((s, a) => s + a.nb_audited_courses, 0)
  const pct = (n: number) => nbTotal > 0 ? Math.round((n / nbTotal) * 100) : 0

  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">
            <ServerStackIcon width={22} height={22} style={{ verticalAlign: 'middle', color: 'var(--brand)', marginRight: 6 }} />
            Plateformes Moodle
          </h1>
          <p className="page-subtitle">
            Ajoutez, testez et gérez les instances Moodle interrogées par MoodleScout. Chaque plateforme désactivée
            devient invisible aux non-admins (audits et cours associés masqués).
          </p>
        </div>
        <div className="page-title-actions" style={{ gap: 8 }}>
          <Link href="/configuration" className="btn btn-secondary">
            <CpuChipIcon width={16} height={16} /> Configurations LLM
          </Link>
        </div>
      </div>

      <div className="stats-row-mini" style={{ marginBottom: 20 }}>
        <StatBox icon={<BuildingLibraryIcon />} color="blue"   n={nbTotal}          label="Configurations" sub="Total" />
        <StatBox icon={<CheckCircleIcon />}     color="green"  n={nbActive}         label="Actives"        sub={`${pct(nbActive)}%`} />
        <StatBox icon={<XCircleIcon />}         color="red"    n={nbInactive}       label="Désactivées"    sub={`${pct(nbInactive)}%`} />
        <StatBox icon={<DocumentTextIcon />}    color="purple" n={nbAudits}         label="Audits"         sub="Réalisés" />
        <StatBox icon={<BookOpenIcon />}        color="orange" n={nbCoursesAudited} label="Cours"          sub="Audités" />
      </div>

      <PlatformsSection
        initial={platforms.map(p => ({
          ...p,
          nbAudits: aggMap.get(p.id)?.nb_audits ?? 0,
          nbCoursesAudited: aggMap.get(p.id)?.nb_audited_courses ?? 0,
        }))}
      />
    </>
  )
}

function StatBox({
  icon, color, n, label, sub,
}: {
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'teal'
  n: number
  label: string
  sub: string
}) {
  return (
    <div className="stat-card-mini with-badge">
      <div className={`stat-card-mini-icon ${color}`}>{icon}</div>
      <div>
        <div className="stat-card-mini-num">{n}</div>
        <div className="stat-card-mini-label">{label}</div>
      </div>
      <span className="stat-card-mini-badge">{sub}</span>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Squares2X2Icon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  ChartBarIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PlateformesGrid, type PlateformeCard } from '@/components/plateformes-grid'
import { activePlatformFilter, canBrowsePlatform, isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type PlatformAggregate = {
  platform_id: string
  nb_audits: number
  nb_audited_courses: number
  nb_conformes: number
}

/**
 * Récupère en une passe : le nombre d'audits par plateforme + le nombre de
 * cours audités (dernier audit réussi par cours, cf. category-stats) + le
 * nombre de cours conformes (score >= 75).
 * `DISTINCT ON` sur (platform_id, course_id) pour éviter de compter plusieurs
 * fois le même cours si plusieurs audits ont tourné dessus.
 */
async function fetchPlatformAggregates(): Promise<Record<string, PlatformAggregate>> {
  const rows = await prisma.$queryRaw<PlatformAggregate[]>`
    WITH latest AS (
      SELECT DISTINCT ON (s.platform_id, ca.course_id)
        s.platform_id,
        ca.score_global
      FROM course_audits ca
      INNER JOIN audit_sessions s ON s.id = ca.session_id
      WHERE ca.error_message IS NULL
      ORDER BY s.platform_id, ca.course_id, ca.created_at DESC
    ),
    audits_per_platform AS (
      SELECT platform_id, COUNT(*)::int AS nb_audits
      FROM audit_sessions
      GROUP BY platform_id
    )
    SELECT
      p.id                     AS platform_id,
      COALESCE(a.nb_audits, 0) AS nb_audits,
      COALESCE(l_count.n, 0)   AS nb_audited_courses,
      COALESCE(l_ok.n, 0)      AS nb_conformes
    FROM moodle_platforms p
    LEFT JOIN audits_per_platform a ON a.platform_id = p.id
    LEFT JOIN (
      SELECT platform_id, COUNT(*)::int AS n FROM latest GROUP BY platform_id
    ) l_count ON l_count.platform_id = p.id
    LEFT JOIN (
      SELECT platform_id, COUNT(*)::int AS n FROM latest WHERE score_global >= 75 GROUP BY platform_id
    ) l_ok ON l_ok.platform_id = p.id
  `
  const map: Record<string, PlatformAggregate> = {}
  for (const r of rows) map[r.platform_id] = r
  return map
}

export default async function PlateformesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user
  // Enseignant : pas d'accès à l'explorateur plateformes (Mes cours suffit).
  if (!canBrowsePlatform(user.role)) redirect('/me/courses')

  const [platforms, aggregates] = await Promise.all([
    prisma.moodlePlatform.findMany({
      where: activePlatformFilter(user.role),
      orderBy: { name: 'asc' },
      select: { id: true, name: true, url: true, version: true, isActive: true },
    }),
    fetchPlatformAggregates(),
  ])

  const plateformes: PlateformeCard[] = platforms.map(p => {
    const agg = aggregates[p.id]
    const successRate = agg && agg.nb_audited_courses > 0
      ? (agg.nb_conformes / agg.nb_audited_courses) * 100
      : null
    return {
      id: p.id,
      name: p.name,
      url: p.url,
      version: p.version,
      isActive: p.isActive,
      auditsCount: agg?.nb_audits ?? 0,
      successRate,
    }
  })

  // Stats globales (sur les plateformes visibles par ce rôle)
  const nbTotal = plateformes.length
  const nbActives = plateformes.filter(p => p.isActive).length
  const nbInactives = nbTotal - nbActives
  const nbAudits = plateformes.reduce((s, p) => s + p.auditsCount, 0)
  const totalAudited = Object.values(aggregates).reduce((s, a) => s + a.nb_audited_courses, 0)
  const totalConformes = Object.values(aggregates).reduce((s, a) => s + a.nb_conformes, 0)
  const successRateGlobal = totalAudited > 0
    ? ((totalConformes / totalAudited) * 100).toFixed(1)
    : null

  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">Plateformes Moodle</h1>
          <p className="page-subtitle">
            Explorez la structure catégorielle de chaque plateforme (filière → niveau → semestre → UE → EC),
            avec les scores agrégés des audits déjà réalisés.
          </p>
        </div>
        <div className="page-title-actions">
          {isAdmin(user.role) && (
            <Link href="/configuration/plateformes" className="btn btn-primary">
              <PlusIcon width={16} height={16} /> Ajouter une plateforme
            </Link>
          )}
        </div>
      </div>

      {/* Stats globales */}
      <div className="stats-row-mini" style={{ marginBottom: 24 }}>
        <StatMini icon={<Squares2X2Icon />} iconColor="blue"   value={nbTotal}    label="Plateformes configurées" />
        <StatMini icon={<CheckCircleIcon />} iconColor="green"  value={nbActives}  label="Actives" />
        <StatMini icon={<XCircleIcon />}    iconColor="red"    value={nbInactives} label="Désactivées" />
        <StatMini icon={<DocumentTextIcon />} iconColor="purple" value={nbAudits}   label="Audits réalisés" />
        <StatMini
          icon={<ChartBarIcon />}
          iconColor={successRateGlobal !== null && Number(successRateGlobal) >= 75 ? 'green' : 'orange'}
          value={successRateGlobal !== null ? `${successRateGlobal}%` : '—'}
          label="Taux de réussite global"
        />
      </div>

      <PlateformesGrid plateformes={plateformes} />
    </>
  )
}

function StatMini({
  icon, iconColor, value, label,
}: {
  icon: React.ReactNode
  iconColor: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'teal'
  value: number | string
  label: string
}) {
  return (
    <div className="stat-card-mini">
      <div className={`stat-card-mini-icon ${iconColor}`}>{icon}</div>
      <div>
        <div className="stat-card-mini-num">{value}</div>
        <div className="stat-card-mini-label">{label}</div>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewAuditForm } from '@/components/new-audit-form'
import { canLaunchAudit, isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ platform?: string; courses?: string; categories?: string }> }

export default async function NewAuditPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Lecteur bloqué — redirection silencieuse vers la liste des audits.
  if (!canLaunchAudit(session.user.role)) redirect('/audits')

  // Pré-remplissage depuis /me/courses : platform + courseIds sélectionnés.
  // Pré-remplissage depuis /plateformes/[id] : platform + catégorie ciblée.
  const sp = await searchParams
  const preselectedPlatformId = sp.platform ?? null
  const preselectedCourseIds = (sp.courses ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0)
  const preselectedCategories = (sp.categories ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const [platforms, llmConfigs] = await Promise.all([
    // Même l'admin ne cible que les plateformes actives depuis cette vue :
    // c'est une vue de lancement, pas une vue d'admin. La gestion
    // active/désactivée se fait dans /configuration.
    prisma.moodlePlatform.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, url: true, version: true },
    }),
    prisma.llmConfig.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, provider: true, model: true, isDefault: true },
    }),
  ])

  if (platforms.length === 0 || llmConfigs.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ExclamationTriangleIcon className="card-icon" /> Configuration incomplète
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            {platforms.length === 0 && 'Aucune plateforme Moodle configurée. '}
            {llmConfigs.length === 0 && 'Aucune configuration LLM disponible. '}
            {isAdmin(session.user.role) ? (
              <>
                Rendez-vous sur la page <Link href="/configuration">Configuration</Link> pour les ajouter.
              </>
            ) : (
              <>Demandez à un administrateur de configurer la plateforme et le LLM.</>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <NewAuditForm
      platforms={platforms}
      llmConfigs={llmConfigs}
      preselectedPlatformId={preselectedPlatformId}
      preselectedCourseIds={preselectedCourseIds}
      preselectedCategories={preselectedCategories}
    />
  )
}

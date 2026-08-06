import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SingleCourseAuditForm } from '@/components/single-course-audit-form'
import { canLaunchAudit, isAdmin } from '@/lib/permissions'
import { visibleLlmsFilter } from '@/lib/llm-access'

export const dynamic = 'force-dynamic'

export default async function SingleCourseAuditPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canLaunchAudit(session.user.role)) redirect('/audits')
  // Enseignant : cette page permet d'auditer un cours ARBITRAIRE de la
  // plateforme (choix libre via l'UI). L'enseignant ne peut auditer que
  // SES propres cours, donc via /me/courses uniquement.
  if (session.user.role === 'enseignant') redirect('/me/courses')

  const [llmConfigs, meRow] = await Promise.all([
    prisma.llmConfig.findMany({
      where: {
        isActive: true,
        ...visibleLlmsFilter({ role: session.user.role, userId: session.user.id }),
      },
      orderBy: [{ scope: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, provider: true, model: true, isDefault: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { defaultLlmConfigId: true },
    }),
  ])

  if (llmConfigs.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ExclamationTriangleIcon className="card-icon" /> Configuration incomplète
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            Aucune configuration LLM disponible.{' '}
            {isAdmin(session.user.role) ? (
              <>
                Rendez-vous sur <Link href="/configuration">Configuration</Link> pour en ajouter une.
              </>
            ) : (
              <>Demandez à un administrateur d&apos;en configurer une.</>
            )}
          </p>
        </div>
      </div>
    )
  }

  return <SingleCourseAuditForm llmConfigs={llmConfigs} myDefaultLlmConfigId={meRow?.defaultLlmConfigId ?? null} />
}

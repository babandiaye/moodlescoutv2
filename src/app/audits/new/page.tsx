import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewAuditForm } from '@/components/new-audit-form'

export const dynamic = 'force-dynamic'

export default async function NewAuditPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [platforms, llmConfigs] = await Promise.all([
    prisma.moodlePlatform.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, url: true, version: true },
    }),
    prisma.llmConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, provider: true, model: true, isDefault: true },
    }),
  ])

  if (platforms.length === 0 || llmConfigs.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span className="card-icon">⚠</span> Configuration incomplète
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            {platforms.length === 0 && 'Aucune plateforme Moodle configurée. '}
            {llmConfigs.length === 0 && 'Aucune configuration LLM disponible. '}
            {session.user.role === 'admin' ? (
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

  return <NewAuditForm platforms={platforms} llmConfigs={llmConfigs} />
}

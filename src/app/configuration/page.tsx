import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CpuChipIcon, ServerStackIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LlmConfigsMasterDetail, type LlmConfig } from '@/components/llm-configs-master-detail'
import { isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function ConfigurationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin(session.user.role)) redirect('/')

  const llmConfigs = await prisma.llmConfig.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      provider: true,
      apiUrl: true,
      model: true,
      isDefault: true,
      isActive: true,
      createdAt: true,
    },
  })

  const initial: LlmConfig[] = llmConfigs.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }))

  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">
            <CpuChipIcon width={28} height={28} style={{ verticalAlign: '-4px', color: 'var(--brand)', marginRight: 8, display: 'inline-block' }} />
            Configurations LLM
          </h1>
          <p className="page-subtitle">
            Ajoutez, testez et gérez les fournisseurs IA (Ollama souverain ou Anthropic Claude) utilisés par les audits.
          </p>
        </div>
        <div className="page-title-actions">
          <Link href="/configuration/plateformes" className="btn btn-secondary">
            <ServerStackIcon width={16} height={16} /> Plateformes Moodle
          </Link>
        </div>
      </div>

      <LlmConfigsMasterDetail initial={initial} />
    </>
  )
}

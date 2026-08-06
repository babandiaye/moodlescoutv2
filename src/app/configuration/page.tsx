import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CpuChipIcon, ServerStackIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LlmConfigsMasterDetail, type LlmConfig } from '@/components/llm-configs-master-detail'
import { visibleLlmsFilter } from '@/lib/llm-access'
import { isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Page de gestion des configs LLM. Accessible aux 3 rôles :
 *  - admin      : CRUD sur les configs partagées + gère aussi ses propres perso
 *  - enseignant : CRUD sur ses propres perso, lecture seule sur les partagées
 *  - lecteur    : lecture seule sur tout, mais peut définir son défaut perso
 */
export default async function ConfigurationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user

  const [llmConfigs, meRow] = await Promise.all([
    prisma.llmConfig.findMany({
      where: visibleLlmsFilter({ role: user.role, userId: user.id }),
      // Ordre : partagées en premier (avec le défaut d'usine en tête), puis persos
      orderBy: [{ scope: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        provider: true,
        apiUrl: true,
        model: true,
        scope: true,
        userId: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultLlmConfigId: true },
    }),
  ])

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
            Mes Fournisseurs IA
          </h1>
          <p className="page-subtitle">
            Configurez vos propres fournisseurs IA (clé Claude / OpenAI / Mistral).
            Le fournisseur partagé <strong>Ollama-UNCHK</strong> est disponible par défaut
            pour tous — géré par la DITSI.
          </p>
        </div>
        {isAdmin(user.role) && (
          <div className="page-title-actions">
            <Link href="/configuration/plateformes" className="btn btn-secondary">
              <ServerStackIcon width={16} height={16} /> Plateformes Moodle
            </Link>
          </div>
        )}
      </div>

      <LlmConfigsMasterDetail
        initial={initial}
        currentUserId={user.id}
        currentUserRole={user.role}
        myDefaultLlmConfigId={meRow?.defaultLlmConfigId ?? null}
      />
    </>
  )
}

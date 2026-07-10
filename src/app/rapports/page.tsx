import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ComingSoon } from '@/components/coming-soon'

export const dynamic = 'force-dynamic'

export default async function RapportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <ComingSoon
      title="Rapports agrégés"
      description="Les rapports par direction, filière et département arriveront bientôt : agrégats catégoriels, comparaisons cross-plateformes, indicateurs de conformité pédagogique — exportables en PDF/Excel/CSV."
      eta="Backlog P3"
    />
  )
}

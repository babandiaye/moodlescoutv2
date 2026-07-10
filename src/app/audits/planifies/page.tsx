import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdmin } from '@/lib/permissions'
import { ComingSoon } from '@/components/coming-soon'

export const dynamic = 'force-dynamic'

export default async function AuditsPlanifiesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin(session.user.role)) redirect('/')

  return (
    <ComingSoon
      title="Audits planifiés"
      description="Automatisez vos audits récurrents : plannings mensuels ou trimestriels par plateforme ou filière, notifications par email, historique des exécutions. La planification s'appuiera sur BullMQ + cron."
      eta="Backlog P3"
    />
  )
}

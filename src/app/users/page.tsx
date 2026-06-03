import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UsersListSection } from '@/components/users-list-section'
import { isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin(session.user.role)) redirect('/')

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      email: true,
      preferredUsername: true,
      fullName: true,
      direction: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLogin: true,
      _count: { select: { auditSessions: true } },
    },
  })

  return <UsersListSection initial={users} currentUserId={session.user.id} />
}

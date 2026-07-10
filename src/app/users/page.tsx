import { redirect } from 'next/navigation'
import {
  UserGroupIcon,
  ShieldCheckIcon,
  UserIcon,
  BookOpenIcon,
  XCircleIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/permissions'
import { UsersTable, type UserRow } from '@/components/users-table'

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

  const rows: UserRow[] = users.map(u => ({
    id: u.id,
    email: u.email,
    preferredUsername: u.preferredUsername,
    fullName: u.fullName,
    direction: u.direction,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
    auditsCount: u._count.auditSessions,
  }))

  // Stats globales
  const nbTotal = rows.length
  const nbAdmins = rows.filter(u => u.role === 'admin').length
  const nbAuditeurs = rows.filter(u => u.role === 'auditeur').length
  const nbLecteurs = rows.filter(u => u.role === 'lecteur').length
  const nbDesactives = rows.filter(u => !u.isActive).length

  const pct = (n: number) => nbTotal > 0 ? Math.round((n / nbTotal) * 100) : 0

  return (
    <>
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">Gestion des utilisateurs</h1>
          <p className="page-subtitle">
            Gérez les comptes des utilisateurs et leurs rôles d&apos;accès à la plateforme.
          </p>
        </div>
        <div className="page-title-actions">
          <button
            type="button"
            className="btn btn-primary"
            title="Les comptes sont créés automatiquement au premier login Keycloak (SSO)"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          >
            <PlusIcon width={16} height={16} /> Ajouter un utilisateur
          </button>
        </div>
      </div>

      <div className="stats-row-mini" style={{ marginBottom: 24 }}>
        <StatUser icon={<UserGroupIcon />} color="blue"   n={nbTotal}      label="Comptes total"     pct={100} />
        <StatUser icon={<ShieldCheckIcon />} color="green"  n={nbAdmins}     label="Administrateurs"   pct={pct(nbAdmins)} />
        <StatUser icon={<UserIcon />}        color="purple" n={nbAuditeurs}  label="Auditeurs"         pct={pct(nbAuditeurs)} />
        <StatUser icon={<BookOpenIcon />}    color="orange" n={nbLecteurs}   label={nbLecteurs > 1 ? 'Lecteurs' : 'Lecteur'} pct={pct(nbLecteurs)} />
        <StatUser icon={<XCircleIcon />}     color="red"    n={nbDesactives} label={nbDesactives > 1 ? 'Désactivé(s)' : 'Désactivé(s)'} pct={pct(nbDesactives)} />
      </div>

      <UsersTable initial={rows} currentUserId={session.user.id} />
    </>
  )
}

function StatUser({
  icon, color, n, label, pct,
}: {
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal'
  n: number
  label: string
  pct: number
}) {
  return (
    <div className="stat-card-mini with-badge">
      <div className={`stat-card-mini-icon ${color}`}>{icon}</div>
      <div>
        <div className="stat-card-mini-num">{n}</div>
        <div className="stat-card-mini-label">{label}</div>
      </div>
      <span className="stat-card-mini-badge">{pct}%</span>
    </div>
  )
}

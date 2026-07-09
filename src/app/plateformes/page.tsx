import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AcademicCapIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { activePlatformFilter } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function PlateformesIndexPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const platforms = await prisma.moodlePlatform.findMany({
    where: activePlatformFilter(session.user.role),
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      url: true,
      version: true,
      isActive: true,
      siteName: true,
      release: true,
      _count: { select: { auditSessions: true } },
    },
  })

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <AcademicCapIcon className="card-icon" /> Plateformes
          </span>
          <span className="badge badge-info">{platforms.length}</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, marginTop: 0 }}>
            Explorez la structure catégorielle de chaque plateforme (filière → niveau → semestre → UE → EC),
            avec les scores agrégés des audits déjà réalisés.
          </p>

          {platforms.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>Aucune plateforme disponible.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {platforms.map(p => (
              <Link
                key={p.id}
                href={`/plateformes/${p.id}`}
                className="platform-item"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="platform-name">{p.name}</span>
                  <span className="badge badge-neutral">Moodle {p.version}.x</span>
                  {!p.isActive && <span className="badge badge-danger">Désactivée</span>}
                </div>
                <span className="platform-url">{p.url}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <span className="badge badge-info">{p._count.auditSessions} audits</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      color: 'var(--brand2)',
                    }}
                  >
                    <MagnifyingGlassIcon style={{ width: 12, height: 12 }} /> Explorer
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

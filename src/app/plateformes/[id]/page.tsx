import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { AcademicCapIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/permissions'
import { PlatformCategoriesView } from '@/components/platform-categories-view'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * Dashboard exploratoire d'une plateforme Moodle : navigation drill-down
 * dans l'arbre catégoriel (filière → niveau → semestre → UE → EC → cours)
 * avec scores agrégés par catégorie.
 *
 * Permet à un directeur de filière de voir "comment vont les cours ANG L1"
 * sans passer par un audit complet — la donnée est déjà là.
 */
export default async function PlatformCategoriesPage({ params }: Ctx) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params

  const platform = await prisma.moodlePlatform.findUnique({
    where: { id },
    select: { id: true, name: true, url: true, isActive: true, siteName: true, release: true },
  })
  if (!platform) notFound()
  if (!platform.isActive && !isAdmin(session.user.role)) redirect('/')

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <AcademicCapIcon className="card-icon" />
            {platform.name}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {!platform.isActive && (
              <span className="badge badge-danger">Désactivée</span>
            )}
            <Link
              href={`/audits/new?platform=${platform.id}`}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              + Nouvel audit sur cette plateforme
            </Link>
          </div>
        </div>
        <div className="card-body">
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            <a href={platform.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand2)' }}>
              {platform.url}
            </a>
            {platform.siteName && <> · {platform.siteName}</>}
            {platform.release && <> · Moodle {platform.release}</>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 12, marginBottom: 0 }}>
            <MagnifyingGlassIcon style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
            Explorez la structure catégorielle de la plateforme. Chaque nœud affiche
            le score moyen des derniers audits de ses cours (y compris ceux des sous-catégories).
            Cliquez « Auditer » sur un nœud pour cibler ses cours.
          </p>
        </div>
      </div>

      <PlatformCategoriesView platformId={platform.id} />
    </div>
  )
}

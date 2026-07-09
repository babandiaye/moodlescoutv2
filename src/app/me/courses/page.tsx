import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AcademicCapIcon, ExclamationTriangleIcon, PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { canLaunchAudit } from '@/lib/permissions'
import {
  getMoodleUserIdByEmail,
  getUserEnrolledCourses,
  type MoodleUserCourse,
} from '@/lib/moodle'

export const dynamic = 'force-dynamic'
// Le fetch parallèle vers N plateformes Moodle peut prendre du temps si une
// instance est lente. On ne veut pas que la page time-out à 30s.
export const maxDuration = 120

type PlatformResult =
  | {
      ok: true
      platform: { id: string; name: string; url: string }
      courses: MoodleUserCourse[]
      userid: number | null
      accessDenied?: boolean
      wsError?: string
    }
  | { ok: false; platform: { id: string; name: string; url: string }; error: string }

type Props = { searchParams: Promise<{ refresh?: string }> }

export default async function MyCoursesPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const email = session.user.email ?? ''
  const canLaunch = canLaunchAudit(session.user.role)
  // Bouton "Rafraîchir" ⇒ ?refresh=1 ⇒ bypass le cache 5 min de Moodle
  const sp = await searchParams
  const bypassCache = sp.refresh === '1'
  if (!email) {
    return (
      <EmptyMessage
        title="Email manquant"
        description="Votre profil n'a pas d'email. Contactez la DITSI pour le corriger côté Keycloak."
      />
    )
  }

  const platforms = await prisma.moodlePlatform.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, url: true, tokenEnc: true },
  })

  // Fetch en parallèle. Une plateforme qui rate ne doit pas casser les autres
  // (Promise.all serait fatal au premier reject) — on encapsule chaque appel.
  const results: PlatformResult[] = await Promise.all(
    platforms.map(async p => {
      try {
        const token = decrypt(p.tokenEnc)
        const userid = await getMoodleUserIdByEmail(p.url, token, email)
        if (!userid) {
          return { ok: true as const, platform: stripToken(p), courses: [], userid: null }
        }
        const res = await getUserEnrolledCourses(p.url, token, userid, {
          teacherOnly: true,
          bypassCache,
        })
        return {
          ok: true as const,
          platform: stripToken(p),
          courses: res.courses,
          userid,
          accessDenied: res.accessDenied,
          wsError: res.error,
        }
      } catch (err) {
        return {
          ok: false as const,
          platform: stripToken(p),
          error: (err as Error).message.slice(0, 200),
        }
      }
    }),
  )

  const totalCourses = results.reduce(
    (n, r) => (r.ok ? n + r.courses.length : n),
    0,
  )

  return (
    <div className="flex-col-20">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <AcademicCapIcon className="card-icon" /> Mes cours
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-info">{platforms.length} plateforme(s)</span>
            <span className="badge badge-success">{totalCourses} cours</span>
            <Link
              href="/me/courses?refresh=1"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              title="Ignorer le cache 5 min et re-interroger Moodle"
            >
              <ArrowPathIcon style={{ width: 12, height: 12 }} /> Rafraîchir
            </Link>
          </div>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 0 }}>
            Cours dans lesquels <strong>{email}</strong> est enseignant ou tuteur sur chaque plateforme
            Moodle configurée. Filtre rôle = <em>editingteacher</em> ou <em>teacher</em>.
          </p>
        </div>
      </div>

      {platforms.length === 0 && (
        <EmptyMessage
          title="Aucune plateforme configurée"
          description="Demandez à un administrateur d'ajouter une plateforme Moodle dans la Configuration."
        />
      )}

      {results.map(r => (
        <PlatformBlock key={r.platform.id} result={r} canLaunch={canLaunch} />
      ))}
    </div>
  )
}

function stripToken(p: { id: string; name: string; url: string; tokenEnc: string }) {
  return { id: p.id, name: p.name, url: p.url }
}

function PlatformBlock({ result, canLaunch }: { result: PlatformResult; canLaunch: boolean }) {
  const courseIds = result.ok ? result.courses.map(c => c.id).join(',') : ''
  const launchHref = `/audits/new?platform=${encodeURIComponent(result.platform.id)}&courses=${courseIds}`
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <AcademicCapIcon className="card-icon" /> {result.platform.name}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {result.ok ? (
            result.accessDenied ? (
              <span className="badge badge-danger">Web service refusé</span>
            ) : result.userid === null ? (
              <span className="badge badge-neutral">Aucun compte avec votre email</span>
            ) : (
              <span className="badge badge-success">{result.courses.length} cours</span>
            )
          ) : (
            <span className="badge badge-danger">Erreur</span>
          )}
          {result.ok && result.courses.length > 0 && canLaunch && (
            <Link href={launchHref} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
              <PlayIcon style={{ width: 12, height: 12 }} /> Auditer ces cours
            </Link>
          )}
        </div>
      </div>
      <div className="card-body">
        {!result.ok && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--danger)' }}>
            <ExclamationTriangleIcon style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{result.error}</span>
          </div>
        )}
        {result.ok && result.accessDenied && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 13,
              padding: '10px 12px',
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius)',
            }}
          >
            <ExclamationTriangleIcon style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Web service refusé par Moodle</strong> — la fonction{' '}
              <code>core_enrol_get_users_courses</code> n&apos;est pas activée dans le service Web
              externe de cette plateforme. Demandez à la DITSI de l&apos;ajouter :
              <em> Administration du site → Serveur → Web services → Services externes</em>.
              {result.wsError && (
                <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.75 }}>
                  Détail Moodle : {result.wsError}
                </div>
              )}
            </div>
          </div>
        )}
        {result.ok && !result.accessDenied && result.userid === null && (
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
            Aucun compte Moodle ne porte cet email sur <code>{result.platform.url}</code>.
          </p>
        )}
        {result.ok &&
          !result.accessDenied &&
          result.userid !== null &&
          result.courses.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
              Vous n&apos;êtes enseignant ou tuteur d&apos;aucun cours sur cette plateforme.
            </p>
          )}
        {result.ok && result.courses.length > 0 && (
          <CoursesList courses={result.courses} platformUrl={result.platform.url} />
        )}
      </div>
    </div>
  )
}

function CoursesList({ courses, platformUrl }: { courses: MoodleUserCourse[]; platformUrl: string }) {
  return (
    <div className="results-table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Nom court</th>
            <th>Cours / UE</th>
            <th style={{ width: 100 }}>Visibilité</th>
            <th style={{ width: 120 }}>Ouvrir</th>
          </tr>
        </thead>
        <tbody>
          {courses.map(c => (
            <tr key={c.id} style={!c.visible ? { opacity: 0.55 } : undefined}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.shortname}</td>
              <td style={{ fontWeight: 500 }}>{c.fullname}</td>
              <td>
                <span className={`badge ${c.visible ? 'badge-success' : 'badge-neutral'}`}>
                  {c.visible ? 'Visible' : 'Cachée'}
                </span>
              </td>
              <td>
                <a
                  href={`${platformUrl.replace(/\/+$/, '')}/course/view.php?id=${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  Voir
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="card">
      <div className="card-body">
        <h3 style={{ fontSize: 14, margin: 0, marginBottom: 6 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{description}</p>
      </div>
    </div>
  )
}

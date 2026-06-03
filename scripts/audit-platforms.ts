/**
 * Audit des 15 plateformes Moodle : pour chacune, appelle
 * core_webservice_get_site_info et affiche un tableau récap :
 *   - compte du token (username, fullname)
 *   - userissiteadmin (compte admin Moodle ?)
 *   - core_user_get_users exposé ?       (compte direct des utilisateurs)
 *   - core_enrol_get_enrolled_users exposé ? (fallback enrolment)
 *   - core_course_get_courses exposé ?   (sanity check, requis pour audits)
 *
 * Permet de voir d'un coup où il manque quoi.
 */
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

type SiteInfo = {
  username?: string
  fullname?: string
  userid?: number
  userissiteadmin?: boolean
  functions?: Array<{ name: string }>
  release?: string
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const axios = (await import('axios')).default

  const platforms = await prisma.moodlePlatform.findMany({
    orderBy: { name: 'asc' },
  })
  console.log(`Audit de ${platforms.length} plateformes...\n`)

  const rows: Array<{
    name: string
    token_user: string
    is_admin: string
    has_get_users: string
    has_enrol: string
    has_courses: string
    release: string
    err?: string
  }> = []

  for (const p of platforms) {
    try {
      const token = decrypt(p.tokenEnc)
      const fd = new URLSearchParams()
      fd.set('wstoken', token)
      fd.set('wsfunction', 'core_webservice_get_site_info')
      fd.set('moodlewsrestformat', 'json')
      const r = await axios.post(`${p.url}/webservice/rest/server.php`, fd.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      })
      const d = r.data as SiteInfo & { exception?: string; message?: string }
      if (d.exception) {
        rows.push({
          name: p.name,
          token_user: '—',
          is_admin: '—',
          has_get_users: '—',
          has_enrol: '—',
          has_courses: '—',
          release: '—',
          err: `${d.exception}: ${d.message ?? ''}`.slice(0, 80),
        })
        continue
      }
      const fnNames = new Set((d.functions ?? []).map(f => f.name))
      rows.push({
        name: p.name,
        token_user: `${d.username ?? '?'} (uid=${d.userid ?? '?'})`,
        is_admin: d.userissiteadmin ? '✓ admin' : '— non-admin',
        has_get_users: fnNames.has('core_user_get_users') ? '✓' : '✗',
        has_enrol: fnNames.has('core_enrol_get_enrolled_users') ? '✓' : '✗',
        has_courses: fnNames.has('core_course_get_courses') ? '✓' : '✗',
        release: d.release ?? '?',
      })
    } catch (err) {
      rows.push({
        name: p.name,
        token_user: '—',
        is_admin: '—',
        has_get_users: '—',
        has_enrol: '—',
        has_courses: '—',
        release: '—',
        err: (err as Error).message.slice(0, 80),
      })
    }
  }

  // Affichage tabulaire
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n)
  console.log(
    pad('Plateforme', 28) +
      pad('Compte token', 28) +
      pad('Admin', 13) +
      pad('get_users', 11) +
      pad('enrol', 7) +
      pad('courses', 9) +
      pad('Release', 18),
  )
  console.log('─'.repeat(28 + 28 + 13 + 11 + 7 + 9 + 18))
  for (const r of rows) {
    if (r.err) {
      console.log(pad(r.name, 28) + '❌ ' + r.err)
    } else {
      console.log(
        pad(r.name, 28) +
          pad(r.token_user, 28) +
          pad(r.is_admin, 13) +
          pad(r.has_get_users, 11) +
          pad(r.has_enrol, 7) +
          pad(r.has_courses, 9) +
          pad(r.release, 18),
      )
    }
  }

  // Synthèse actionnable
  const okDirect = rows.filter(r => r.has_get_users === '✓').length
  const fallbackOnly = rows.filter(r => r.has_get_users === '✗' && r.has_enrol === '✓').length
  const broken = rows.filter(r => r.has_courses !== '✓').length
  const admins = rows.filter(r => r.is_admin === '✓ admin').length

  console.log('\nSynthèse :')
  console.log(`  - ${okDirect}/${rows.length} avec core_user_get_users exposé → compte direct possible`)
  console.log(`  - ${fallbackOnly}/${rows.length} sans core_user_get_users mais avec enrol → fallback marche`)
  console.log(`  - ${broken}/${rows.length} sans core_course_get_courses → audits cassés`)
  console.log(`  - ${admins}/${rows.length} tokens rattachés à un admin Moodle`)

  if (fallbackOnly > 0 && admins === rows.length) {
    console.log(`\n💡 Tous les tokens sont admin Moodle. Il suffit d'ajouter`)
    console.log(`   core_user_get_users à la liste des fonctions du service`)
    console.log(`   sur ${fallbackOnly} plateforme(s) pour avoir le compte exact partout.`)
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

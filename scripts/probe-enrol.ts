// Probe core_enrol_get_enrolled_users sur une plateforme :
// 1) Récupère 1-2 cours via core_course_get_courses
// 2) Appelle core_enrol_get_enrolled_users sur le premier avec userfields=id
// 3) Mesure latence + tailles de payload + détecte accessexception
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const name = process.argv[2]
if (!name) {
  console.error('Usage : pnpm tsx scripts/probe-enrol.ts "<NOM_PLATEFORME>"')
  process.exit(1)
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const axios = (await import('axios')).default

  const p = await prisma.moodlePlatform.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
  })
  if (!p) {
    console.error(`Aucune plateforme trouvée pour "${name}"`)
    process.exit(1)
  }
  const token = decrypt(p.tokenEnc)
  const wsUrl = `${p.url.replace(/\/+$/, '')}/webservice/rest/server.php`
  console.log(`URL : ${wsUrl}\n`)

  async function call(label: string, wsfunction: string, params: Record<string, string | number> = {}) {
    const fd = new URLSearchParams()
    fd.set('wstoken', token)
    fd.set('wsfunction', wsfunction)
    fd.set('moodlewsrestformat', 'json')
    for (const [k, v] of Object.entries(params)) fd.set(k, String(v))
    const start = Date.now()
    try {
      const r = await axios.post(wsUrl, fd.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        validateStatus: () => true,
      })
      const ms = Date.now() - start
      const body = r.data
      if (body && typeof body === 'object' && 'exception' in body) {
        console.log(`[${label}] ❌ ${ms}ms — ${body.errorcode} : ${body.message}`)
        return null
      }
      const bytes = JSON.stringify(body).length
      console.log(`[${label}] ✅ ${ms}ms — ${Array.isArray(body) ? body.length + ' items' : 'objet'}, ${bytes} octets JSON`)
      return body
    } catch (err: any) {
      console.log(`[${label}] ⚠ ${err.code ?? err.message}`)
      return null
    }
  }

  const courses = (await call('core_course_get_courses', 'core_course_get_courses')) as Array<{ id: number; shortname?: string; fullname?: string }> | null
  if (!Array.isArray(courses) || courses.length === 0) {
    console.error('Pas de cours sur cette plateforme, impossible de tester enrol.')
    return
  }
  // Le cours id=1 est le "Site Course" (page d'accueil), on prend le 2e si dispo.
  const sample = courses.find(c => c.id !== 1) ?? courses[0]
  console.log(`\nCours échantillon : id=${sample.id} (${sample.shortname ?? sample.fullname ?? '—'})\n`)

  await call('enrol / userfields=id', 'core_enrol_get_enrolled_users', {
    courseid: sample.id,
    'options[0][name]': 'userfields',
    'options[0][value]': 'id',
  })

  await call('enrol / userfields=id,onlyactive=1', 'core_enrol_get_enrolled_users', {
    courseid: sample.id,
    'options[0][name]': 'userfields',
    'options[0][value]': 'id',
    'options[1][name]': 'onlyactive',
    'options[1][value]': '1',
  })

  await call('enrol / SANS userfields (payload complet)', 'core_enrol_get_enrolled_users', {
    courseid: sample.id,
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

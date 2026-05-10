// Mesure le coût réel d'appeler core_enrol_get_enrolled_users sur N cours
// en parallèle avec concurrence variable. Aide à déterminer la concurrence
// optimale sans saturer Moodle.
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const name = process.argv[2]
const nCourses = Number(process.argv[3] ?? 30)
const conc = Number(process.argv[4] ?? 10)
if (!name) {
  console.error('Usage : pnpm tsx scripts/probe-enrol-bulk.ts "<NOM>" [nCours=30] [concurrence=10]')
  process.exit(1)
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const { pLimit } = await import('../src/lib/concurrency')
  const axios = (await import('axios')).default

  const p = await prisma.moodlePlatform.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
  })
  if (!p) {
    console.error(`Aucune plateforme trouvée`)
    process.exit(1)
  }
  const token = decrypt(p.tokenEnc)
  const wsUrl = `${p.url.replace(/\/+$/, '')}/webservice/rest/server.php`

  // Récupère N cours
  const fd = new URLSearchParams()
  fd.set('wstoken', token)
  fd.set('wsfunction', 'core_course_get_courses')
  fd.set('moodlewsrestformat', 'json')
  const r = await axios.post(wsUrl, fd.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  })
  const courses = (r.data as Array<{ id: number; shortname?: string }>).filter(c => c.id !== 1).slice(0, nCourses)
  console.log(`${courses.length} cours à tester, concurrence ${conc}\n`)

  const limit = pLimit(conc)
  const start = Date.now()
  const timings: Array<{ id: number; ms: number; users: number; err?: string }> = []

  await Promise.all(
    courses.map(c =>
      limit(async () => {
        const fd2 = new URLSearchParams()
        fd2.set('wstoken', token)
        fd2.set('wsfunction', 'core_enrol_get_enrolled_users')
        fd2.set('moodlewsrestformat', 'json')
        fd2.set('courseid', String(c.id))
        fd2.set('options[0][name]', 'userfields')
        fd2.set('options[0][value]', 'id')
        const t0 = Date.now()
        try {
          const rr = await axios.post(wsUrl, fd2.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000,
            validateStatus: () => true,
          })
          const ms = Date.now() - t0
          if (rr.data && typeof rr.data === 'object' && 'exception' in rr.data) {
            timings.push({ id: c.id, ms, users: 0, err: rr.data.errorcode })
            return
          }
          const users = Array.isArray(rr.data) ? rr.data.length : 0
          timings.push({ id: c.id, ms, users })
        } catch (err: any) {
          timings.push({ id: c.id, ms: Date.now() - t0, users: 0, err: err.code ?? err.message })
        }
      }),
    ),
  )

  const total = Date.now() - start
  timings.sort((a, b) => b.ms - a.ms)
  console.log('Top 10 plus lents :')
  for (const t of timings.slice(0, 10)) {
    console.log(`  course ${t.id.toString().padStart(5)} : ${t.ms.toString().padStart(5)}ms — ${t.users} users${t.err ? '  ERR=' + t.err : ''}`)
  }
  const ok = timings.filter(t => !t.err)
  const errs = timings.filter(t => t.err)
  const avg = ok.length ? Math.round(ok.reduce((s, t) => s + t.ms, 0) / ok.length) : 0
  const userSum = ok.reduce((s, t) => s + t.users, 0)
  console.log(`\nTotal wall : ${total}ms`)
  console.log(`Succès : ${ok.length}/${timings.length} — moy ${avg}ms/appel`)
  console.log(`Erreurs : ${errs.length} (${errs.slice(0, 5).map(e => e.err).join(', ')})`)
  console.log(`Users cumulés (non distincts) : ${userSum}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

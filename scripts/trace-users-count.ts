// Trace en direct l'exécution de countDistinctEnrolledUsers pour comprendre
// les hangs constatés via inspect-users-count.ts.
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const { moodleCall, getCourses } = await import('../src/lib/moodle')
  const { pLimit } = await import('../src/lib/concurrency')

  const p = await prisma.moodlePlatform.findFirst({ where: { name: 'P6 MASTER' } })
  if (!p) {
    console.error('Plateforme P6 MASTER introuvable')
    process.exit(1)
  }
  const token = decrypt(p.tokenEnc)

  console.log('1) getCourses...')
  const t0 = Date.now()
  const courses = await getCourses(p.url, token)
  console.log(`   → ${courses.length} cours en ${Date.now() - t0}ms`)

  const real = courses.filter(c => c.id !== 1)
  console.log(`2) ${real.length} cours réels (id !== 1)`)

  const limit = pLimit(10)
  const userIds = new Set<number>()
  let done = 0
  let errors = 0
  const t1 = Date.now()

  // Log de progression toutes les secondes
  const tick = setInterval(() => {
    console.log(`   → progression: ${done}/${real.length} (errs=${errors}, distinct=${userIds.size}, ${Date.now() - t1}ms)`)
  }, 1000)

  await Promise.all(
    real.map(c =>
      limit(async () => {
        try {
          const r = await moodleCall<Array<{ id: number }>>(
            p.url,
            token,
            'core_enrol_get_enrolled_users',
            {
              courseid: c.id,
              'options[0][name]': 'userfields',
              'options[0][value]': 'id',
            },
          )
          if (Array.isArray(r)) for (const u of r) if (typeof u.id === 'number') userIds.add(u.id)
        } catch (err) {
          errors++
          if (errors <= 3) console.log(`   ❌ course ${c.id} : ${(err as Error).message.slice(0, 120)}`)
        } finally {
          done++
        }
      }),
    ),
  )
  clearInterval(tick)
  console.log(`\n3) Terminé en ${Date.now() - t1}ms — distinct=${userIds.size}, errors=${errors}`)
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

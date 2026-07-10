/**
 * Rafraîchit le comptage utilisateurs de toutes les plateformes actives et
 * stocke le résultat en BD (moodle_platforms.nb_users + updated_at + method).
 *
 * Usage :
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/refresh-platform-users.ts
 *
 * Prévu pour tourner via systemd timer nocturne (voir
 * /etc/systemd/system/moodlescoutv2-refresh-users.{service,timer}).
 *
 * Politique en cas d'échec :
 *  - Une plateforme qui plante n'empêche pas les autres de se rafraîchir
 *    (traitement séquentiel + try/catch par plateforme).
 *  - Si `getUsersTotalCount()` renvoie `total: null`, on ne touche PAS à
 *    nb_users : on garde la valeur précédente pour ne pas régresser (mieux
 *    vaut une valeur d'hier qu'un "—" transitoire).
 */

import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { getUsersTotalCount } from '../src/lib/moodle'
import { logger } from '../src/lib/logger'

async function main() {
  const t0 = Date.now()
  const platforms = await prisma.moodlePlatform.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, url: true, tokenEnc: true, nbUsers: true },
  })

  logger.info({ nb: platforms.length }, 'Refresh users cache : démarrage')

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const p of platforms) {
    const start = Date.now()
    try {
      const token = decrypt(p.tokenEnc)
      const res = await getUsersTotalCount(p.url, token)
      const dt = Date.now() - start

      if (res.total === null) {
        logger.warn(
          { platform: p.name, url: p.url, dt, errors: res.errors.slice(0, 2), previous: p.nbUsers },
          'Refresh users : total null, on garde la valeur précédente',
        )
        skipped++
        continue
      }

      await prisma.moodlePlatform.update({
        where: { id: p.id },
        data: {
          nbUsers: res.total,
          nbUsersUpdatedAt: new Date(),
          usersMethod: res.method,
        },
      })
      logger.info(
        { platform: p.name, total: res.total, method: res.method, dt },
        'Refresh users : OK',
      )
      ok++
    } catch (err) {
      logger.error(
        { platform: p.name, url: p.url, err: (err as Error).message.slice(0, 200) },
        'Refresh users : erreur',
      )
      failed++
    }
  }

  logger.info(
    { total: platforms.length, ok, skipped, failed, dt: Date.now() - t0 },
    'Refresh users cache : terminé',
  )
  await prisma.$disconnect()
}

main().catch(async err => {
  logger.error({ err: (err as Error).message }, 'Refresh users cache : crash')
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})

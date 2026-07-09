/**
 * Nettoie la file BullMQ des jobs qui référencent une session déjà supprimée
 * en base. Sans ça, chaque tentative du worker plante avec un FK violation et
 * pollue les logs indéfiniment.
 *
 * Usage :
 *   pnpm tsx scripts/cleanup-orphan-jobs.ts           # dry-run (par défaut)
 *   pnpm tsx scripts/cleanup-orphan-jobs.ts --apply   # supprime réellement
 */
import { getAuditQueue } from '../src/lib/queue'
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')

async function main() {
  const queue = getAuditQueue()

  // On regarde les jobs waiting, active, delayed, prioritized, failed.
  // Les "completed" sont ignorés (résultat OK) et les "failed" seront
  // supprimés aussi si leur session n'existe plus (empêche un retry manuel
  // de repartir sur une session zombie).
  const states = ['waiting', 'active', 'delayed', 'prioritized', 'failed'] as const
  const jobs = await queue.getJobs([...states])
  console.log(`Jobs dans la file (${states.join(', ')}) : ${jobs.length}`)

  const summary = {
    total: jobs.length,
    orphan: 0,
    kept: 0,
    removed: 0,
    errors: 0,
  }

  for (const job of jobs) {
    const sessionId = (job.data as { sessionId?: string })?.sessionId
    if (!sessionId) {
      summary.errors++
      console.log(`  · Job ${job.id} sans sessionId — ignoré`)
      continue
    }

    const exists = await prisma.auditSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    })

    if (!exists) {
      summary.orphan++
      console.log(`  · ORPHELIN : job ${job.id} → session ${sessionId} (état ${await job.getState()})`)
      if (APPLY) {
        try {
          await job.remove()
          summary.removed++
        } catch (err) {
          summary.errors++
          console.log(`    ✗ suppression échouée : ${(err as Error).message}`)
        }
      }
    } else {
      summary.kept++
    }
  }

  console.log('\n─── Résumé ───')
  console.log(`Total examinés   : ${summary.total}`)
  console.log(`Orphelins        : ${summary.orphan}`)
  console.log(`Actifs (gardés)  : ${summary.kept}`)
  if (APPLY) {
    console.log(`Supprimés        : ${summary.removed}`)
  } else {
    console.log(`Mode DRY-RUN — rien supprimé. Relancer avec --apply pour appliquer.`)
  }
  if (summary.errors) console.log(`Erreurs          : ${summary.errors}`)

  await queue.close()
  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

// Dump score_global + sous-scores LLM + conformite_pct pour vérifier
// manuellement la cohérence avant un backfill.
// Usage : pnpm tsx scripts/inspect-score.ts SHORTNAME1 SHORTNAME2 ...
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const shortnames = process.argv.slice(2)
if (!shortnames.length) {
  console.error('Usage : pnpm tsx scripts/inspect-score.ts <SHORTNAME> [SHORTNAME...]')
  process.exit(1)
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const rows = await prisma.courseAudit.findMany({
    where: { shortname: { in: shortnames } },
    select: {
      id: true,
      shortname: true,
      fullname: true,
      scoreGlobal: true,
      resultJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  for (const r of rows) {
    const rj = r.resultJson as any
    const ai = rj?.ai ?? {}
    const pert = Number(ai.pertinence_contenu ?? 0)
    const qual = Number(ai.qualite_evaluation ?? 0)
    const struc = Number(ai.structure_pedagogique ?? 0)
    const engag = Number(ai.engagement_prevu ?? 0)
    const subAvg = (pert + qual + struc + engag) / 4
    const aiScore = Math.round(Math.min(100, subAvg * 10))
    const confPct = Number(rj?.conformite_pct ?? 0)
    const llmScore = Number(ai.score_global ?? 0)
    const newScore =
      llmScore > 0 ? Math.round(0.7 * aiScore + 0.3 * confPct) : 0

    console.log(`\n━━━ ${r.shortname} (${r.fullname?.slice(0, 50) ?? '—'}) ━━━`)
    console.log(`  audité le      : ${r.createdAt.toISOString().slice(0, 10)}`)
    console.log(`  score_global   : ${r.scoreGlobal} (en BD)`)
    console.log(`  sous-scores    : pertinence=${pert}/10  qualite=${qual}/10  structure=${struc}/10  engagement=${engag}/10`)
    console.log(`  moyenne SS     : ${subAvg.toFixed(2)}/10  =>  aiScore=${aiScore}/100`)
    console.log(`  LLM score_glob : ${llmScore}/100  (ce que le LLM a renvoyé en synthèse)`)
    console.log(`  conformite_pct : ${confPct}/100  (structurel)`)
    console.log(`  ancien score   : ${r.scoreGlobal}  =  min(100, ${llmScore} + bonus)`)
    console.log(`  nouveau score  : ${newScore}  =  round(0.7×${aiScore} + 0.3×${confPct})`)
    console.log(`  écart          : ${newScore - (r.scoreGlobal ?? 0)}`)
  }
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })

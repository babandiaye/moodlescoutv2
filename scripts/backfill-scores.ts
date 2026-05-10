/**
 * Recalcule score_global sur tous les CourseAudit existants avec la nouvelle
 * formule hybride 70/30 — SANS rappel LLM (utilise les sous-scores déjà
 * stockés dans resultJson.ai).
 *
 * Formule (cohérente avec src/lib/audit.ts) :
 *   subAvg     = (pertinence + qualite_eval + structure + engagement) / 4
 *   aiScore    = clamp(subAvg * 10, 0, 100)
 *   score      = ai.score_global > 0
 *                  ? round(0.7 * aiScore + 0.3 * conformite_pct)
 *                  : 0
 *
 * Usage :
 *   pnpm backfill:scores              # dry-run (montre les écarts, n'écrit pas)
 *   pnpm backfill:scores --apply      # applique les changements en BD
 */
// ATTENTION : .env.local doit être chargé AVANT d'importer prisma (qui lit
// DATABASE_URL à l'init). On utilise donc un import dynamique de prisma plus
// bas dans main(), pas un `import` ES statique en tête de fichier.
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const APPLY = process.argv.includes('--apply')

type AuditAi = {
  pertinence_contenu?: number
  qualite_evaluation?: number
  structure_pedagogique?: number
  engagement_prevu?: number
  score_global?: number
}

type AuditResult = {
  ai?: AuditAi
  conformite_pct?: number
  score_global?: number
  score_ia?: number
  score_bonus?: number
  score_struct?: number
}

function recompute(rj: AuditResult): { score: number; aiScore: number; structPct: number } {
  const ai = rj.ai ?? {}
  const subAvg =
    (Number(ai.pertinence_contenu ?? 0) +
      Number(ai.qualite_evaluation ?? 0) +
      Number(ai.structure_pedagogique ?? 0) +
      Number(ai.engagement_prevu ?? 0)) /
    4
  const aiScore = Math.min(100, Math.max(0, subAvg * 10))
  const structPct = Number(rj.conformite_pct ?? 0)
  const score =
    Number(ai.score_global ?? 0) > 0
      ? Math.round(Math.min(100, Math.max(0, 0.7 * aiScore + 0.3 * structPct)))
      : 0
  return { score, aiScore: Math.round(aiScore), structPct }
}

async function main() {
  console.log(`[backfill] mode = ${APPLY ? 'APPLY (écrit en BD)' : 'DRY-RUN (lecture seule)'}`)

  // Import dynamique : prisma init lit DATABASE_URL au require, et l'env
  // .env.local vient juste d'être chargé ci-dessus.
  const { prisma } = await import('../src/lib/prisma')

  const audits = await prisma.courseAudit.findMany({
    select: { id: true, sessionId: true, shortname: true, scoreGlobal: true, resultJson: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`[backfill] ${audits.length} CourseAudit à traiter`)

  let changed = 0
  let unchanged = 0
  let skipped = 0
  const samples: Array<{ shortname: string; before: number; after: number; delta: number }> = []

  for (const a of audits) {
    const rj = a.resultJson as AuditResult | null
    if (!rj || typeof rj !== 'object' || !rj.ai) {
      skipped++
      continue
    }
    const before = a.scoreGlobal ?? 0
    const { score, aiScore, structPct } = recompute(rj)

    if (score === before) {
      unchanged++
      continue
    }

    changed++
    const delta = score - before
    samples.push({ shortname: a.shortname ?? '—', before, after: score, delta })

    if (APPLY) {
      const newResultJson = {
        ...rj,
        score_ia: aiScore,
        score_struct: structPct,
        score_global: score,
      }
      await prisma.courseAudit.update({
        where: { id: a.id },
        data: { scoreGlobal: score, resultJson: newResultJson as any },
      })
    }
  }

  // Top 10 baisses + top 10 hausses pour vérifier la cohérence
  samples.sort((a, b) => a.delta - b.delta)
  console.log('\n[backfill] Top 10 baisses :')
  for (const s of samples.slice(0, 10)) {
    console.log(`  ${s.shortname.padEnd(20)} ${s.before} -> ${s.after} (${s.delta})`)
  }
  console.log('\n[backfill] Top 10 hausses :')
  for (const s of samples.slice(-10).reverse()) {
    console.log(`  ${s.shortname.padEnd(20)} ${s.before} -> ${s.after} (+${s.delta})`)
  }

  // Distribution avant/après (seuils conformité)
  const dist = (vals: number[]) => ({
    conforme: vals.filter(v => v >= 75).length,
    aAmeliorer: vals.filter(v => v >= 50 && v < 75).length,
    nonConforme: vals.filter(v => v < 50).length,
    moyenne: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0,
  })
  const before = dist(audits.map(a => a.scoreGlobal ?? 0))
  const after = dist(
    audits.map(a => {
      const rj = a.resultJson as AuditResult | null
      if (!rj || !rj.ai) return a.scoreGlobal ?? 0
      return recompute(rj).score
    }),
  )
  console.log('\n[backfill] Distribution :')
  console.log(`  Avant  : ${before.conforme} conformes / ${before.aAmeliorer} à améliorer / ${before.nonConforme} non conformes — moyenne ${before.moyenne}/100`)
  console.log(`  Après  : ${after.conforme} conformes / ${after.aAmeliorer} à améliorer / ${after.nonConforme} non conformes — moyenne ${after.moyenne}/100`)

  console.log(`\n[backfill] Total : ${changed} modifiés, ${unchanged} inchangés, ${skipped} ignorés (resultJson invalide)`)
  if (!APPLY) console.log("[backfill] Aucune écriture (dry-run). Relance avec --apply pour appliquer.")

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[backfill] erreur :', err)
  process.exit(1)
})

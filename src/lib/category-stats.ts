import { prisma } from './prisma'
import type { CategoriesTree } from './moodle'

/**
 * Agrégation des scores d'audit par catégorie Moodle.
 *
 * Principe : pour chaque cours de la plateforme, on prend le DERNIER audit
 * réussi (errorMessage IS NULL) et on propage son score à toutes les
 * catégories du chemin (catégorie du cours + ancêtres remontant à la racine).
 * Ainsi la "filière ANG" agrège tous ses cours (L1 + L2 + L3 + Master…),
 * la "L1" agrège tous les cours L1, etc.
 *
 * Perf : un seul $queryRaw avec DISTINCT ON pour ne pas charger tout
 * resultJson côté client Prisma (économie mémoire sur grosses plateformes).
 */

export type CategoryAggregate = {
  coursesAudited: number
  scoreSum: number
  scoreMin: number
  scoreMax: number
  conformes: number // score_global >= 75
}

export type CategoryStats = {
  coursesAudited: number
  scoreAvg: number
  scoreMin: number
  scoreMax: number
  conformes: number
  conformesPct: number
}

type CourseRow = {
  course_id: number
  score_global: number | null
  category_id: number | null
}

/**
 * Récupère le score du dernier audit réussi pour chaque cours d'une plateforme.
 * Utilise `DISTINCT ON (course_id)` PostgreSQL pour ne garder que la ligne
 * la plus récente par cours, avec extraction directe de `category_id` du JSONB.
 */
async function fetchLatestCourseScores(platformId: string): Promise<CourseRow[]> {
  // Note : `platform_id` est stocké en `text` par Prisma (pas `uuid`), même si
  // la valeur EST un UUID. Pas de cast — on compare texte à texte.
  return await prisma.$queryRaw<CourseRow[]>`
    SELECT DISTINCT ON (ca.course_id)
      ca.course_id,
      ca.score_global,
      NULLIF((ca.result_json->>'category_id'), '')::int AS category_id
    FROM course_audits ca
    INNER JOIN audit_sessions s ON s.id = ca.session_id
    WHERE s.platform_id = ${platformId}
      AND ca.error_message IS NULL
    ORDER BY ca.course_id, ca.created_at DESC
  `
}

/**
 * Construit une map <catId, agrégat> en propageant chaque cours à ses ancêtres.
 * Si un cours est dans "ANG > Licence 1 > S1 > UE Grammaire > EC1", il compte
 * dans chacun de ces 5 nœuds — c'est ce qui permet le drill-down cohérent.
 */
export function aggregateByCategory(
  rows: CourseRow[],
  tree: CategoriesTree,
): Map<number, CategoryAggregate> {
  const agg = new Map<number, CategoryAggregate>()

  const bump = (catId: number, score: number) => {
    let a = agg.get(catId)
    if (!a) {
      a = { coursesAudited: 0, scoreSum: 0, scoreMin: Infinity, scoreMax: -Infinity, conformes: 0 }
      agg.set(catId, a)
    }
    a.coursesAudited++
    a.scoreSum += score
    if (score < a.scoreMin) a.scoreMin = score
    if (score > a.scoreMax) a.scoreMax = score
    if (score >= 75) a.conformes++
  }

  const visited = new Set<number>()
  for (const row of rows) {
    const score = row.score_global ?? 0
    let current = row.category_id ?? 0
    visited.clear()
    while (current && tree[current] && !visited.has(current)) {
      visited.add(current)
      bump(current, score)
      current = tree[current].parent
    }
  }

  return agg
}

/**
 * Convertit l'agrégat interne en stats prêtes à l'UI (moyenne, pourcentage).
 */
export function finalizeStats(agg: CategoryAggregate): CategoryStats {
  return {
    coursesAudited: agg.coursesAudited,
    scoreAvg: agg.coursesAudited > 0 ? Math.round(agg.scoreSum / agg.coursesAudited) : 0,
    scoreMin: agg.scoreMin === Infinity ? 0 : agg.scoreMin,
    scoreMax: agg.scoreMax === -Infinity ? 0 : agg.scoreMax,
    conformes: agg.conformes,
    conformesPct: agg.coursesAudited > 0 ? Math.round((agg.conformes / agg.coursesAudited) * 100) : 0,
  }
}

export type CategoryNode = {
  id: number
  name: string
  parent: number
  depth: number
  coursecount: number
  children: CategoryNode[]
  stats?: CategoryStats
}

/**
 * Construit l'arbre navigable à partir de l'arbre plat Moodle + les stats.
 * Retourne les racines (parent = 0), avec sub-tree récursif trié par nom.
 */
export function buildCategoryTree(
  moodleTree: CategoriesTree,
  agg?: Map<number, CategoryAggregate>,
): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>()
  for (const cid of Object.keys(moodleTree)) {
    const id = Number(cid)
    const m = moodleTree[id]
    nodes.set(id, {
      id,
      name: m.name,
      parent: m.parent,
      depth: m.depth,
      coursecount: m.coursecount,
      children: [],
      stats: agg?.get(id) ? finalizeStats(agg.get(id)!) : undefined,
    })
  }
  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    if (node.parent && nodes.has(node.parent)) {
      nodes.get(node.parent)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortByName = (a: CategoryNode, b: CategoryNode) => a.name.localeCompare(b.name, 'fr')
  const sortDeep = (n: CategoryNode) => {
    n.children.sort(sortByName)
    n.children.forEach(sortDeep)
  }
  roots.sort(sortByName)
  roots.forEach(sortDeep)
  return roots
}

/**
 * Fonction complète : charge les scores agrégés d'une plateforme depuis la BD
 * et retourne l'arbre navigable. Le tree Moodle doit être fourni (déjà en
 * cache Redis 30 min via getCategoriesTree).
 */
export async function buildPlatformCategoryTree(
  platformId: string,
  moodleTree: CategoriesTree,
): Promise<{ tree: CategoryNode[]; hasStats: boolean; coursesAudited: number }> {
  const rows = await fetchLatestCourseScores(platformId)
  const agg = aggregateByCategory(rows, moodleTree)
  const tree = buildCategoryTree(moodleTree, agg)
  return { tree, hasStats: rows.length > 0, coursesAudited: rows.length }
}

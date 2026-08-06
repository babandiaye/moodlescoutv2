/**
 * Helpers centralisés pour la visibilité et modification des configs LLM.
 *
 * Politique :
 *   - Configs `shared`    : visibles par tous, modifiables uniquement par admin
 *   - Configs `personal`  : visibles/modifiables uniquement par leur propriétaire
 *     (l'admin ne les voit PAS non plus — privacy by default)
 *
 * Un seul point d'entrée pour toutes les vérifs → pas de règle éparpillée qui
 * s'éloigne du modèle et devient une bombe à retardement.
 */
import type { LlmConfig, LlmScope, UserRole } from '@prisma/client'
import { prisma } from './prisma'

export type LlmVisibilityCtx = {
  role: UserRole
  userId: string
}

/**
 * Filtre Prisma pour ne renvoyer que les configs visibles par cet utilisateur.
 * À composer via spread dans un `where`. Retourne un OR car un user voit
 * DEUX ensembles à la fois : les partagées + les siennes.
 */
export function visibleLlmsFilter(ctx: LlmVisibilityCtx) {
  return {
    OR: [
      { scope: 'shared' as LlmScope },
      { scope: 'personal' as LlmScope, userId: ctx.userId },
    ],
  }
}

/**
 * Retourne true si l'utilisateur peut VOIR cette config (métadonnées + le fait
 * qu'elle existe, PAS la clé en clair). L'admin ne voit pas les configs perso
 * des autres utilisateurs — c'est un choix de conception assumé.
 */
export function canViewLlm(
  ctx: LlmVisibilityCtx,
  llm: Pick<LlmConfig, 'scope' | 'userId'>,
): boolean {
  if (llm.scope === 'shared') return true
  return llm.userId === ctx.userId
}

/**
 * Retourne true si l'utilisateur peut MODIFIER (PATCH) cette config :
 *   - shared    : admin uniquement
 *   - personal  : le propriétaire uniquement (même pas l'admin)
 */
export function canModifyLlm(
  ctx: LlmVisibilityCtx,
  llm: Pick<LlmConfig, 'scope' | 'userId'>,
): boolean {
  if (llm.scope === 'shared') return ctx.role === 'admin'
  return llm.userId === ctx.userId
}

/**
 * Peut supprimer. Règle stricte : l'admin peut supprimer une config shared
 * SAUF si elle est le défaut d'usine actif (isDefault=true + isActive=true)
 * — sinon on casserait le fallback pour tout le monde. Le "Ollama-UNCHK" en
 * particulier est protégé par ce garde-fou.
 */
export function canDeleteLlm(
  ctx: LlmVisibilityCtx,
  llm: Pick<LlmConfig, 'scope' | 'userId' | 'isDefault' | 'isActive'>,
): { ok: true } | { ok: false; reason: string } {
  if (llm.scope === 'shared') {
    if (ctx.role !== 'admin') return { ok: false, reason: 'Réservé à l\'admin' }
    if (llm.isDefault && llm.isActive) {
      return {
        ok: false,
        reason:
          'Cette configuration est le défaut d\'usine actif — impossible à supprimer sans casser le fallback des utilisateurs. Marquez d\'abord une autre config partagée comme défaut.',
      }
    }
    return { ok: true }
  }
  // personal : owner uniquement
  return llm.userId === ctx.userId
    ? { ok: true }
    : { ok: false, reason: 'Vous n\'êtes pas propriétaire de cette configuration' }
}

/**
 * Résout la config LLM à utiliser pour un audit lancé par cet utilisateur.
 * Ordre de préférence :
 *   1) requestedId (formulaire) — validé côté visibilité
 *   2) user.defaultLlmConfigId  — le défaut personnel
 *   3) shared + isDefault=true  — le fallback partagé (Ollama-UNCHK)
 *
 * Rejette avec un message actionnable si aucune config utilisable.
 */
export async function resolveEffectiveLlm(
  ctx: LlmVisibilityCtx,
  requestedId: string | null | undefined,
): Promise<
  | { ok: true; llm: LlmConfig }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string }
> {
  // 1) ID explicite (choix formulaire)
  if (requestedId) {
    const llm = await prisma.llmConfig.findUnique({ where: { id: requestedId } })
    if (!llm) return { ok: false, status: 404, error: 'Configuration LLM introuvable' }
    if (!canViewLlm(ctx, llm)) {
      // 404 volontaire (pas 403) : ne pas révéler qu'une config perso d'un
      // autre user existe.
      return { ok: false, status: 404, error: 'Configuration LLM introuvable' }
    }
    if (!llm.isActive) {
      return { ok: false, status: 400, error: 'Cette configuration LLM est désactivée' }
    }
    return { ok: true, llm }
  }

  // 2) Défaut personnel de l'utilisateur
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { defaultLlmConfigId: true },
  })
  if (user?.defaultLlmConfigId) {
    const llm = await prisma.llmConfig.findUnique({ where: { id: user.defaultLlmConfigId } })
    if (llm && canViewLlm(ctx, llm) && llm.isActive) {
      return { ok: true, llm }
    }
    // La config a été supprimée ou désactivée entre-temps — on tombe sur (3).
  }

  // 3) Fallback partagé (Ollama-UNCHK)
  const fallback = await prisma.llmConfig.findFirst({
    where: { scope: 'shared', isDefault: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  if (fallback) return { ok: true, llm: fallback }

  return {
    ok: false,
    status: 500,
    error:
      'Aucun LLM disponible. Contactez l\'administrateur pour activer au moins une configuration partagée.',
  }
}

/**
 * Helpers centralisés pour les checks de permission. Permet d'éviter d'avoir
 * des `role === 'admin' || role === 'enseignant'` éparpillés dans le code, qui
 * deviendraient des bombes à retardement le jour où on ajoute un 4e rôle.
 *
 * Sémantique des 3 rôles :
 *   - admin    : tout (gestion users, plateformes, LLM configs, lancer, voir)
 *   - enseignant : audite ses propres cours, voit/exporte/annule UNIQUEMENT les siens
 *   - lecteur  : lecture seule GLOBALE — voit + exporte TOUS les audits,
 *                ne peut PAS lancer/annuler, pas d'accès aux pages admin
 */
import type { UserRole } from '@prisma/client'

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

/**
 * Peut lancer un nouvel audit (consomme des slots LLM).
 * Note : l'enseignant peut lancer un audit UNIQUEMENT sur ses propres cours
 * (via le bouton "Auditer ce cours" sur /me/courses). L'entrée générique
 * "Lancer un audit" (plateforme entière) et "Analyser un cours" (cours
 * arbitraire de la plateforme) lui sont interdites — voir canBrowsePlatform.
 */
export function canLaunchAudit(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'enseignant'
}

/**
 * Peut naviguer les pages "plateforme entière" (Plateformes, Analyser un
 * cours quelconque, Lancer un audit de plateforme). L'enseignant n'y a pas
 * accès — il ne voit que sa boîte de Mes cours + ses audits.
 */
export function canBrowsePlatform(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'lecteur'
}

/** Voit TOUS les audits sans filtre par userId (admin + lecteur). */
export function canViewAllAudits(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'lecteur'
}

/**
 * Peut consulter/exporter UN audit donné.
 *   - admin : tout
 *   - lecteur : tout
 *   - enseignant : uniquement le sien
 */
export function canViewAudit(
  role: UserRole | null | undefined,
  currentUserId: string,
  auditUserId: string,
): boolean {
  if (role === 'admin' || role === 'lecteur') return true
  return currentUserId === auditUserId
}

/**
 * Peut MODIFIER (annuler/supprimer) un audit donné.
 * Plus strict que canViewAudit : le lecteur ne peut PAS modifier.
 *   - admin : tout
 *   - enseignant : uniquement le sien
 *   - lecteur : aucun (lecture seule)
 */
export function canModifyAudit(
  role: UserRole | null | undefined,
  currentUserId: string,
  auditUserId: string,
): boolean {
  if (role === 'admin') return true
  if (role === 'enseignant') return currentUserId === auditUserId
  return false
}

/**
 * Filtre Prisma pour lister les plateformes visibles par ce rôle :
 *   - admin : voit tout (actives + désactivées)
 *   - autres : ne voient que les plateformes actives
 *
 * À composer avec d'autres `where` via spread. Utilisé partout où on liste
 * des plateformes côté UI/API pour les non-admins.
 */
export function activePlatformFilter(
  role: UserRole | null | undefined,
): { isActive?: true } {
  return isAdmin(role) ? {} : { isActive: true }
}

/**
 * Filtre Prisma pour les audits : masque les audits associés à des plateformes
 * désactivées pour tout le monde sauf l'admin. Cohérent avec la règle "si la
 * plateforme est désactivée les non-admins ne la voient plus, ni ses cours".
 */
export function activeAuditPlatformFilter(
  role: UserRole | null | undefined,
): { platform?: { isActive: true } } {
  return isAdmin(role) ? {} : { platform: { isActive: true } }
}

/** Libellé d'affichage humain du rôle. */
export function roleLabel(role: UserRole | null | undefined): string {
  switch (role) {
    case 'admin':
      return 'Administrateur'
    case 'enseignant':
      return 'Enseignant'
    case 'lecteur':
      return 'Lecteur'
    default:
      return '—'
  }
}

/**
 * Helpers centralisés pour les checks de permission. Permet d'éviter d'avoir
 * des `role === 'admin' || role === 'auditeur'` éparpillés dans le code, qui
 * deviendraient des bombes à retardement le jour où on ajoute un 4e rôle.
 *
 * Sémantique des 3 rôles :
 *   - admin    : tout (gestion users, plateformes, LLM configs, lancer, voir)
 *   - auditeur : lance des audits, voit/exporte/annule UNIQUEMENT les siens
 *   - lecteur  : lecture seule GLOBALE — voit + exporte TOUS les audits,
 *                ne peut PAS lancer/annuler, pas d'accès aux pages admin
 */
import type { UserRole } from '@prisma/client'

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

/** Peut lancer un nouvel audit (consomme des slots LLM). */
export function canLaunchAudit(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'auditeur'
}

/** Voit TOUS les audits sans filtre par userId (admin + lecteur). */
export function canViewAllAudits(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'lecteur'
}

/**
 * Peut consulter/exporter UN audit donné.
 *   - admin : tout
 *   - lecteur : tout
 *   - auditeur : uniquement le sien
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
 *   - auditeur : uniquement le sien
 *   - lecteur : aucun (lecture seule)
 */
export function canModifyAudit(
  role: UserRole | null | undefined,
  currentUserId: string,
  auditUserId: string,
): boolean {
  if (role === 'admin') return true
  if (role === 'auditeur') return currentUserId === auditUserId
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
    case 'auditeur':
      return 'Auditeur'
    case 'lecteur':
      return 'Lecteur'
    default:
      return '—'
  }
}

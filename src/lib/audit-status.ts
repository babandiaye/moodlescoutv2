/**
 * Source de vérité unique pour les états d'une AuditSession et leur affichage.
 * Toute UI affichant le statut d'un audit DOIT importer d'ici, sinon ajouter
 * un nouvel état (ex: "paused") devient un chasse-aux-trésors.
 */

export type AuditStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export const STATUS_BADGE: Record<AuditStatus, string> = {
  pending: 'badge-neutral',
  running: 'badge-warn',
  completed: 'badge-success',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
}

export const STATUS_LABEL: Record<AuditStatus, string> = {
  pending: 'En attente',
  running: 'En cours',
  completed: 'Terminé',
  failed: 'Échec',
  cancelled: 'Annulé',
}

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status as AuditStatus] ?? 'badge-neutral'
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as AuditStatus] ?? status
}

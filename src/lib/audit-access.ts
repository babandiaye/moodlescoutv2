import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canViewAudit, canModifyAudit, isAdmin } from '@/lib/permissions'

type AccessSuccess = {
  ok: true
  audit: {
    id: string
    userId: string
    status: string
    platform: { id: string; name: string; isActive: boolean }
  }
}

type AccessFailure = { ok: false; response: NextResponse }

/**
 * Vérifie l'accès à un audit pour les sous-routes /api/audits/[id]/*.
 * Centralise 3 checks (existence, permission utilisateur, plateforme active).
 *
 * Un audit rattaché à une plateforme DÉSACTIVÉE est invisible à tout le monde
 * sauf l'admin (même règle que pour la page /audits/[id] et la liste /audits).
 * Sans ce check ici, un auditeur pouvait encore récupérer un export PDF/Excel
 * en tapant l'URL directement — c'est le trou de sécu que P0 corrige.
 *
 * @param needsModify true pour cancel/DELETE — utilise canModifyAudit (plus strict, exclut le lecteur)
 */
export async function checkAuditAccess(
  auditId: string,
  user: { id: string; role: UserRole },
  needsModify = false,
): Promise<AccessSuccess | AccessFailure> {
  const audit = await prisma.auditSession.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      userId: true,
      status: true,
      platform: { select: { id: true, name: true, isActive: true } },
    },
  })
  if (!audit) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Introuvable' }, { status: 404 }),
    }
  }
  const canSee = needsModify
    ? canModifyAudit(user.role, user.id, audit.userId)
    : canViewAudit(user.role, user.id, audit.userId)
  if (!canSee) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }),
    }
  }
  if (!audit.platform.isActive && !isAdmin(user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Plateforme désactivée par l\'administrateur.' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, audit }
}

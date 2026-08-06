import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'
import { canViewLlm } from '@/lib/llm-access'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Change le LLM par défaut de l'utilisateur courant.
 * Body : { llmConfigId: string } — doit pointer sur une config visible par lui
 * (partagée ou sienne). Renvoie 404 sinon pour ne pas révéler l'existence
 * d'une config perso d'un autre user.
 *
 * Body : { llmConfigId: null } — reset au fallback partagé (Ollama-UNCHK)
 * qui sera résolu à chaque audit par lib/llm-access.resolveEffectiveLlm.
 */
const bodySchema = z.object({
  llmConfigId: z.string().uuid().nullable(),
})

export async function PUT(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Body invalide : { llmConfigId: string|null }' },
      { status: 400 },
    )
  }

  const { llmConfigId } = parsed.data

  if (llmConfigId !== null) {
    const llm = await prisma.llmConfig.findUnique({ where: { id: llmConfigId } })
    if (!llm || !canViewLlm({ role: a.user.role, userId: a.user.id }, llm)) {
      return NextResponse.json({ error: 'Configuration LLM introuvable' }, { status: 404 })
    }
    if (!llm.isActive) {
      return NextResponse.json(
        { error: 'Cette configuration est désactivée — activez-la avant d\'en faire votre défaut' },
        { status: 400 },
      )
    }
  }

  await prisma.user.update({
    where: { id: a.user.id },
    data: { defaultLlmConfigId: llmConfigId },
  })

  logger.info(
    { userId: a.user.id, newDefaultLlmConfigId: llmConfigId },
    'Défaut LLM utilisateur mis à jour',
  )
  return NextResponse.json({ ok: true, defaultLlmConfigId: llmConfigId })
}

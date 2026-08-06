import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { visibleLlmsFilter } from '@/lib/llm-access'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Schéma création :
 *   - scope='shared'   : admin uniquement. userId reste null.
 *   - scope='personal' : n'importe quel user connecté. userId = son id.
 *
 * `isDefault` ne peut être set qu'à la création d'une config shared, et
 * uniquement par admin — c'est le "défaut d'usine" pour tous les users.
 * Le défaut PERSONNEL se change via `PUT /api/me/default-llm`.
 */
// z.preprocess : normalise `""` → null AVANT la validation .url() qui
// refuserait une chaîne vide. Le formulaire modal initialise apiUrl à ''
// même quand le provider est Anthropic (URL non requise) — sans ce garde,
// zod renverrait "Invalid URL" et la création échouerait silencieusement.
const nullableUrl = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.string().url().nullable(),
)
const nullableStr = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.string().min(8).nullable(),
)

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['ollama', 'anthropic']),
  apiUrl: nullableUrl.optional(),
  apiKey: nullableStr.optional(),
  model: z.string().min(1).default('gemma3:12b'),
  scope: z.enum(['shared', 'personal']).default('personal'),
  isDefault: z.boolean().default(false),
})

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  // Filtre visibilité : partagées + siennes uniquement.
  const configs = await prisma.llmConfig.findMany({
    where: visibleLlmsFilter({ role: a.user.role, userId: a.user.id }),
    orderBy: [{ scope: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      provider: true,
      apiUrl: true,
      model: true,
      scope: true,
      userId: true,
      isDefault: true,
      isActive: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ configs })
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, provider, apiUrl, apiKey, model, scope, isDefault } = parsed.data

  // Une config shared est réservée à l'admin.
  if (scope === 'shared' && a.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Seul un admin peut créer une configuration partagée.' },
      { status: 403 },
    )
  }
  // Idem pour marquer comme défaut d'usine (isDefault=true = défaut de TOUS).
  if (isDefault && (scope !== 'shared' || a.user.role !== 'admin')) {
    return NextResponse.json(
      {
        error:
          'Le drapeau "défaut d\'usine" ne s\'applique qu\'aux configurations partagées (admin). Pour votre défaut personnel : PUT /api/me/default-llm.',
      },
      { status: 403 },
    )
  }

  if (provider === 'anthropic' && !apiKey) {
    return NextResponse.json({ error: 'Clé API Anthropic requise' }, { status: 400 })
  }
  if (provider === 'ollama' && !apiUrl) {
    return NextResponse.json({ error: 'URL Ollama requise' }, { status: 400 })
  }

  const apiKeyEnc = apiKey ? encrypt(apiKey) : null
  const userId = scope === 'personal' ? a.user.id : null

  const created = await prisma.$transaction(async tx => {
    // Si nouvelle config shared marquée comme défaut : décoche les autres
    // défauts SHARED (pas les défauts personal d'autres users).
    if (isDefault) {
      await tx.llmConfig.updateMany({
        where: { scope: 'shared', isDefault: true },
        data: { isDefault: false },
      })
    }
    return tx.llmConfig.create({
      data: {
        name,
        provider,
        apiUrl: apiUrl ?? null,
        apiKeyEnc,
        model,
        scope,
        userId,
        isDefault,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        apiUrl: true,
        model: true,
        scope: true,
        userId: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
    })
  })

  logger.info(
    { id: created.id, provider, scope, userId, byUserId: a.user.id },
    'Config LLM créée',
  )
  return NextResponse.json({ config: created }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['ollama', 'anthropic']),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(8).optional().nullable(),
  model: z.string().min(1).default('gemma3:12b'),
  isDefault: z.boolean().default(false),
})

export async function GET() {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const configs = await prisma.llmConfig.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      provider: true,
      apiUrl: true,
      model: true,
      isDefault: true,
      isActive: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ configs })
}

export async function POST(req: NextRequest) {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, provider, apiUrl, apiKey, model, isDefault } = parsed.data

  if (provider === 'anthropic' && !apiKey) {
    return NextResponse.json({ error: 'Clé API Anthropic requise' }, { status: 400 })
  }
  if (provider === 'ollama' && !apiUrl) {
    return NextResponse.json({ error: 'URL Ollama requise' }, { status: 400 })
  }

  const apiKeyEnc = apiKey ? encrypt(apiKey) : null

  const created = await prisma.$transaction(async tx => {
    if (isDefault) {
      await tx.llmConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }
    return tx.llmConfig.create({
      data: { name, provider, apiUrl: apiUrl ?? null, apiKeyEnc, model, isDefault },
      select: {
        id: true,
        name: true,
        provider: true,
        apiUrl: true,
        model: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
    })
  })

  logger.info({ id: created.id, provider }, 'Config LLM créée')
  return NextResponse.json({ config: created }, { status: 201 })
}

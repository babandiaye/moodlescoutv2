import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { canViewLlm } from '@/lib/llm-access'
import { listOllamaModels, listOpenaiModels } from '@/lib/llm'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const cfg = await prisma.llmConfig.findUnique({ where: { id } })
  if (!cfg || !canViewLlm({ role: a.user.role, userId: a.user.id }, cfg)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

  const apiKey = cfg.apiKeyEnc ? decrypt(cfg.apiKeyEnc) : undefined

  if (cfg.provider === 'ollama') {
    if (!cfg.apiUrl) {
      return NextResponse.json({ error: 'URL Ollama manquante' }, { status: 400 })
    }
    try {
      const models = await listOllamaModels({ apiUrl: cfg.apiUrl, apiKey })
      return NextResponse.json({ provider: 'ollama', models })
    } catch (err) {
      logger.warn({ err: (err as Error).message, id }, 'Liste modèles Ollama échouée')
      return NextResponse.json(
        { error: `Impossible de joindre Ollama : ${(err as Error).message}` },
        { status: 502 },
      )
    }
  }

  if (cfg.provider === 'openai') {
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API OpenAI manquante' }, { status: 400 })
    }
    try {
      const models = await listOpenaiModels({ apiKey })
      return NextResponse.json({ provider: 'openai', models })
    } catch (err) {
      logger.warn({ err: (err as Error).message, id }, 'Liste modèles OpenAI échouée')
      return NextResponse.json(
        { error: `Impossible de joindre OpenAI : ${(err as Error).message}` },
        { status: 502 },
      )
    }
  }

  // Anthropic
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 400 })
  }
  try {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
      validateStatus: () => true,
    })
    if (res.status !== 200) {
      return NextResponse.json(
        { error: `Anthropic HTTP ${res.status} — ${res.data?.error?.message ?? 'erreur'}` },
        { status: 502 },
      )
    }
    const data = res.data?.data ?? []
    const models = Array.isArray(data)
      ? data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean)
      : []
    return NextResponse.json({ provider: 'anthropic', models })
  } catch (err) {
    logger.warn({ err: (err as Error).message, id }, 'Liste modèles Anthropic échouée')
    return NextResponse.json(
      { error: `Impossible de joindre Anthropic : ${(err as Error).message}` },
      { status: 502 },
    )
  }
}

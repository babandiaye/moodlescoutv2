import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { canViewLlm } from '@/lib/llm-access'
import { listOllamaModels } from '@/lib/llm'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  const cfg = await prisma.llmConfig.findUnique({ where: { id } })
  // Guard visibilité — 404 même si l'admin cherche à tester la config perso
  // d'un autre user (privacy).
  if (!cfg || !canViewLlm({ role: a.user.role, userId: a.user.id }, cfg)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

  const apiKey = cfg.apiKeyEnc ? decrypt(cfg.apiKeyEnc) : undefined
  const start = Date.now()

  try {
    if (cfg.provider === 'ollama') {
      if (!cfg.apiUrl) {
        return NextResponse.json(
          { ok: false, error: 'URL Ollama manquante' },
          { status: 200 },
        )
      }
      const models = await listOllamaModels({ apiUrl: cfg.apiUrl, apiKey })
      const hasModel = models.includes(cfg.model)
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - start,
        provider: 'ollama',
        modelsCount: models.length,
        configuredModelAvailable: hasModel,
        configuredModel: cfg.model,
        sampleModels: models.slice(0, 5),
      })
    }

    // Anthropic — ping via /v1/models (auth check léger)
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Clé API Anthropic manquante' },
        { status: 200 },
      )
    }
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 10000,
      validateStatus: () => true,
    })
    if (res.status !== 200) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - start,
        error: `HTTP ${res.status} — ${res.data?.error?.message ?? 'authentification refusée'}`,
      })
    }
    const data = res.data?.data ?? []
    const modelIds = Array.isArray(data) ? data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean) : []
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      provider: 'anthropic',
      modelsCount: modelIds.length,
      configuredModelAvailable: modelIds.includes(cfg.model),
      configuredModel: cfg.model,
      sampleModels: modelIds.slice(0, 5),
    })
  } catch (err) {
    const message = (err as Error).message
    logger.warn({ id, err: message }, 'Test LLM: échec')
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - start,
      error: message,
    })
  }
}

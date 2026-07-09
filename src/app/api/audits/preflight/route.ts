import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/api-helpers'
import { isAdmin } from '@/lib/permissions'
import { getSiteInfo } from '@/lib/moodle'
import { listOllamaModels } from '@/lib/llm'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pré-flight avant de lancer un audit : vérifie que TOUT ce dont l'audit va
 * dépendre est joignable et prêt.
 *   - Plateforme Moodle (WS accessible + token valide)
 *   - Serveur LLM (Ollama joignable OU clé Anthropic valide)
 *   - Modèle configuré effectivement disponible sur le serveur LLM
 *
 * Retourne un statut par check indépendamment — si un seul KO, l'UI bloque
 * le bouton "Lancer" et affiche le détail.
 */

const bodySchema = z.object({
  platformId: z.string().min(1),
  llmConfigId: z.string().min(1),
})

type CheckResult = {
  ok: boolean
  latencyMs: number
  message: string
  detail?: Record<string, unknown>
}

async function checkPlatform(platformId: string, isAdminUser: boolean): Promise<CheckResult> {
  const start = Date.now()
  const platform = await prisma.moodlePlatform.findUnique({ where: { id: platformId } })
  if (!platform) {
    return { ok: false, latencyMs: 0, message: 'Plateforme introuvable en base' }
  }
  if (!platform.isActive && !isAdminUser) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: 'Plateforme désactivée par l\'administrateur.',
    }
  }
  try {
    const token = decrypt(platform.tokenEnc)
    const info = await getSiteInfo(platform.url, token)
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: `${info.sitename ?? platform.name} — Moodle ${info.release ?? '?'}`,
      detail: {
        sitename: info.sitename,
        release: info.release,
        version: info.version,
        wsUser: info.username,
      },
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: `Plateforme injoignable : ${(err as Error).message.slice(0, 120)}`,
    }
  }
}

async function checkLlm(
  llmConfigId: string,
): Promise<{ llm: CheckResult; model: CheckResult }> {
  const start = Date.now()
  const cfg = await prisma.llmConfig.findUnique({ where: { id: llmConfigId } })
  if (!cfg) {
    return {
      llm: { ok: false, latencyMs: 0, message: 'Config LLM introuvable' },
      model: { ok: false, latencyMs: 0, message: '—' },
    }
  }
  if (!cfg.isActive) {
    return {
      llm: { ok: false, latencyMs: 0, message: 'Fournisseur IA désactivé par l\'administrateur' },
      model: { ok: false, latencyMs: 0, message: '—' },
    }
  }

  const apiKey = cfg.apiKeyEnc ? decrypt(cfg.apiKeyEnc) : undefined

  if (cfg.provider === 'ollama') {
    if (!cfg.apiUrl) {
      return {
        llm: { ok: false, latencyMs: 0, message: 'URL Ollama manquante dans la config' },
        model: { ok: false, latencyMs: 0, message: '—' },
      }
    }
    try {
      const models = await listOllamaModels({ apiUrl: cfg.apiUrl, apiKey })
      const llmMs = Date.now() - start
      const hasModel = models.includes(cfg.model)
      return {
        llm: {
          ok: true,
          latencyMs: llmMs,
          message: `Ollama joignable — ${models.length} modèle(s) disponibles`,
          detail: { url: cfg.apiUrl, modelsCount: models.length },
        },
        model: hasModel
          ? {
              ok: true,
              latencyMs: 0,
              message: `Modèle "${cfg.model}" présent sur le serveur`,
              detail: { model: cfg.model },
            }
          : {
              ok: false,
              latencyMs: 0,
              message: `Modèle "${cfg.model}" ABSENT du serveur (${models.length} modèles listés)`,
              detail: { model: cfg.model, availableSample: models.slice(0, 8) },
            },
      }
    } catch (err) {
      return {
        llm: {
          ok: false,
          latencyMs: Date.now() - start,
          message: `Ollama injoignable : ${(err as Error).message.slice(0, 120)}`,
        },
        model: { ok: false, latencyMs: 0, message: 'Non vérifié (LLM injoignable)' },
      }
    }
  }

  // Anthropic
  if (!apiKey) {
    return {
      llm: { ok: false, latencyMs: 0, message: 'Clé API Anthropic manquante' },
      model: { ok: false, latencyMs: 0, message: '—' },
    }
  }
  try {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
      validateStatus: () => true,
    })
    const llmMs = Date.now() - start
    if (res.status !== 200) {
      return {
        llm: {
          ok: false,
          latencyMs: llmMs,
          message: `Anthropic HTTP ${res.status} — ${res.data?.error?.message ?? 'échec auth'}`,
        },
        model: { ok: false, latencyMs: 0, message: 'Non vérifié' },
      }
    }
    const modelIds = Array.isArray(res.data?.data)
      ? res.data.data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean)
      : []
    const hasModel = modelIds.includes(cfg.model)
    return {
      llm: {
        ok: true,
        latencyMs: llmMs,
        message: `Anthropic joignable — ${modelIds.length} modèle(s) accessibles`,
        detail: { modelsCount: modelIds.length },
      },
      model: hasModel
        ? {
            ok: true,
            latencyMs: 0,
            message: `Modèle "${cfg.model}" disponible`,
            detail: { model: cfg.model },
          }
        : {
            ok: false,
            latencyMs: 0,
            message: `Modèle "${cfg.model}" INDISPONIBLE sur votre plan Anthropic`,
            detail: { model: cfg.model, availableSample: modelIds.slice(0, 8) },
          },
    }
  } catch (err) {
    return {
      llm: {
        ok: false,
        latencyMs: Date.now() - start,
        message: `Anthropic injoignable : ${(err as Error).message.slice(0, 120)}`,
      },
      model: { ok: false, latencyMs: 0, message: 'Non vérifié' },
    }
  }
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { platformId, llmConfigId } = parsed.data

  // Checks en parallèle (indépendants) — on gagne ~1-2 s selon la latence WS.
  const [platform, llmPair] = await Promise.all([
    checkPlatform(platformId, isAdmin(a.user.role)),
    checkLlm(llmConfigId),
  ])

  const allOk = platform.ok && llmPair.llm.ok && llmPair.model.ok
  logger.info(
    { userId: a.user.id, platformId, llmConfigId, allOk },
    'Preflight audit',
  )

  return NextResponse.json({
    ok: allOk,
    checks: {
      platform,
      llm: llmPair.llm,
      model: llmPair.model,
    },
  })
}

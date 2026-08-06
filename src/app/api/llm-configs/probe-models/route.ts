import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import axios from 'axios'
import { requireAuth } from '@/lib/api-helpers'
import { listOllamaModels, listOpenaiModels } from '@/lib/llm'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Teste une config LLM SANS la créer, et renvoie la liste des modèles
 * disponibles pour ce fournisseur.
 *
 * Cas d'usage : bouton "Tester" du formulaire "Nouveau fournisseur IA".
 * Permet de basculer le champ "Modèle" d'un input libre (source d'anomalies :
 * on peut taper 'gemma3:12b' pour un provider Anthropic) vers un dropdown
 * peuplé uniquement des modèles réellement disponibles pour cette clé/URL.
 *
 * Retourne :
 *   200 { ok: true, models: string[] }
 *   200 { ok: false, error: string }  ← test échoué, message affichable
 *   400/401 pour les erreurs de requête
 */
const schema = z.object({
  provider: z.enum(['ollama', 'anthropic', 'openai']),
  apiUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Paramètres invalides' },
      { status: 400 },
    )
  }
  const { provider, apiUrl, apiKey } = parsed.data

  try {
    if (provider === 'ollama') {
      if (!apiUrl) {
        return NextResponse.json({ ok: false, error: 'URL Ollama requise' })
      }
      const models = await listOllamaModels({
        apiUrl,
        apiKey: apiKey ?? undefined,
      })
      return NextResponse.json({ ok: true, models })
    }

    if (provider === 'openai') {
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'Clé API OpenAI requise' })
      }
      const models = await listOpenaiModels({ apiKey })
      return NextResponse.json({ ok: true, models })
    }

    // Anthropic
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'Clé API Anthropic requise' })
    }
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
      validateStatus: () => true,
    })
    if (res.status !== 200) {
      return NextResponse.json({
        ok: false,
        error: `Anthropic HTTP ${res.status} — ${res.data?.error?.message ?? 'échec authentification'}`,
      })
    }
    const data = res.data?.data ?? []
    const models = Array.isArray(data)
      ? data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean)
      : []
    return NextResponse.json({ ok: true, models })
  } catch (err) {
    logger.info(
      { provider, err: (err as Error).message.slice(0, 120) },
      'Probe LLM échoué',
    )
    return NextResponse.json({
      ok: false,
      error: `Impossible de contacter ${provider} : ${(err as Error).message.slice(0, 150)}`,
    })
  }
}

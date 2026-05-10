import { redis } from './redis'
import { logger } from './logger'

/**
 * Sémaphore Redis pour limiter la concurrence des appels LLM.
 *
 * Cas d'usage : fromager.unchk.sn = 1 GPU. Avec gemma3:12b qui pèse ~7 GB en
 * VRAM, on ne peut servir qu'1-2 inférences simultanées avant saturation.
 * Ce sémaphore gate les appels à `runLlm` globalement (entre tous les jobs
 * BullMQ et tous les cours en parallèle dans un même job).
 *
 * Implémentation :
 *   - Compteur Redis `llm:active`
 *   - Acquisition via script Lua atomique (INCR + check + DECR si dépassement)
 *   - TTL de 10 min pour éviter les leaks si un worker crash en plein appel
 *   - Polling 800-1200 ms (jitter) en cas de saturation
 *   - Timeout configurable (5 min par défaut)
 *
 * Si Redis est indisponible OU max=0 : exécution directe sans throttle
 * (comportement actuel pré-D, dégradation gracieuse).
 */

const LLM_SLOT_KEY = 'llm:active'
const LLM_SLOT_TTL_SEC = 600 // 10 min — couvre les inférences les plus longues
const POLL_BASE_MS = 800
const POLL_JITTER_MS = 400

const ACQUIRE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if current > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`

/**
 * Exécute `fn` après acquisition d'un slot LLM.
 * Le slot est libéré automatiquement (DECR) que `fn` réussisse ou jette.
 *
 * @param maxConcurrent  Nombre max de slots simultanés (1 pour Ollama mono-GPU,
 *                       5-10 pour Anthropic). Si <= 0 : pas de throttle.
 * @param fn             Fonction à exécuter sous protection du sémaphore
 * @param opts.timeoutMs Timeout d'attente d'un slot (default 5 min)
 * @param opts.label     Étiquette pour les logs (ex: "ollama-fromager")
 */
export async function withLlmSlot<T>(
  maxConcurrent: number,
  fn: () => Promise<T>,
  opts?: { timeoutMs?: number; label?: string },
): Promise<T> {
  if (!redis || maxConcurrent <= 0) {
    return await fn()
  }

  const timeoutMs = opts?.timeoutMs ?? 300_000
  const label = opts?.label ?? 'llm'
  const start = Date.now()
  let waitedMs = 0

  while (true) {
    let acquired: number = 0
    try {
      acquired = (await redis.eval(
        ACQUIRE_LUA,
        1,
        LLM_SLOT_KEY,
        String(maxConcurrent),
        String(LLM_SLOT_TTL_SEC),
      )) as number
    } catch (err) {
      // Redis a hoqueté : on dégrade gracieusement et on exécute sans throttle.
      logger.warn(
        { err: (err as Error).message, label },
        'Sémaphore LLM : Redis indispo, exécution sans throttle',
      )
      return await fn()
    }

    if (acquired === 1) {
      if (waitedMs > 0) {
        logger.info(
          { label, waitedMs, maxConcurrent },
          'Sémaphore LLM : slot acquis après attente',
        )
      }
      try {
        return await fn()
      } finally {
        try {
          await redis.decr(LLM_SLOT_KEY)
        } catch {
          // Le TTL nettoiera en cas de problème
        }
      }
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Sémaphore LLM : timeout (${Math.round(timeoutMs / 1000)}s) en attente d'un slot (max=${maxConcurrent})`,
      )
    }

    const sleep = POLL_BASE_MS + Math.random() * POLL_JITTER_MS
    await new Promise(r => setTimeout(r, sleep))
    waitedMs = Date.now() - start
  }
}

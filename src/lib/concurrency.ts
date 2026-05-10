/**
 * Limiteur de concurrence inspiré de p-limit (sans dépendance externe).
 *
 * Usage :
 *   const limit = pLimit(5)
 *   const tasks = items.map(item => limit(async () => doWork(item)))
 *   await Promise.all(tasks)
 *
 * Garantit qu'au plus `concurrency` exécutions de la fonction tournent
 * simultanément. Les autres patientent dans une file FIFO.
 */
export function pLimit(concurrency: number) {
  if (concurrency < 1 || !Number.isFinite(concurrency)) {
    throw new Error(`pLimit: concurrency must be >= 1 (got ${concurrency})`)
  }
  let active = 0
  const queue: Array<() => void> = []

  const release = () => {
    active--
    const next = queue.shift()
    if (next) next()
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

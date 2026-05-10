'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type LogType = 'info' | 'platform' | 'analyzing' | 'success' | 'done' | 'error' | 'warn'
type LogLine = { ts: number; type: LogType; msg: string }

type Props = {
  sessionId: string
  initial: {
    status: string
    done: number
    failed: number
    total: number
  }
}

export function AuditLiveView({ sessionId, initial }: Props) {
  const router = useRouter()
  const [progress, setProgress] = useState({
    done: initial.done,
    failed: initial.failed,
    total: initial.total,
    current: '',
  })
  const [status, setStatus] = useState<string>(initial.status)
  const [logs, setLogs] = useState<LogLine[]>([
    { ts: Date.now(), type: 'info', msg: 'Connexion au flux SSE…' },
  ])
  const logsRef = useRef<HTMLDivElement>(null)
  const lastLogged = useRef<{ done: number; failed: number }>({ done: -1, failed: -1 })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rafraîchit les données serveur (résultats partiels) avec un debounce
  // pour éviter un re-render à chaque cours quand l'audit est rapide.
  const scheduleRefresh = (delayMs = 1500) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), delayMs)
  }

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [logs])

  useEffect(() => {
    const es = new EventSource(`/api/audits/${sessionId}/stream`)

    const pushLog = (type: LogType, msg: string) =>
      setLogs(p => [...p.slice(-499), { ts: Date.now(), type, msg }])

    es.addEventListener('snapshot', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setStatus(data.status)
        setProgress(p => ({ ...p, done: data.done, failed: data.failed, total: data.total }))
        pushLog('info', `Statut initial : ${data.status} — ${data.done}/${data.total}`)
      } catch {
        // ignore
      }
    })

    es.addEventListener('progress', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setProgress(p => ({
          ...p,
          done: data.done,
          failed: data.failed,
          total: data.total,
          current: data.current ?? p.current,
        }))
        if (
          data.current &&
          (data.done !== lastLogged.current.done || data.failed !== lastLogged.current.failed)
        ) {
          lastLogged.current = { done: data.done, failed: data.failed }
          pushLog('analyzing', `Analyse ${data.done + 1}/${data.total} : ${data.current}`)
        }
      } catch {
        // ignore
      }
    })

    es.addEventListener('course', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        pushLog('success', `Score ${data.score}/100 — ${data.shortname}`)
        // Recharge les résultats partiels affichés sous le live view.
        scheduleRefresh()
      } catch {
        // ignore
      }
    })

    es.addEventListener('status', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setStatus(data.status)
        if (data.status === 'running') pushLog('platform', `Audit démarré`)
        if (data.status === 'completed') pushLog('done', 'Audit terminé')
        if (data.status === 'failed') pushLog('error', 'Audit en échec')
        if (data.status === 'cancelled') pushLog('warn', 'Audit annulé')
      } catch {
        // ignore
      }
    })

    es.addEventListener('error', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (data?.message) pushLog('error', data.message)
      } catch {
        // EventSource error event with no data — ignore (it auto-reconnects)
      }
    })

    es.addEventListener('end', () => {
      es.close()
      pushLog('done', 'Flux fermé — rechargement des résultats…')
      setTimeout(() => router.refresh(), 800)
    })

    return () => {
      es.close()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [sessionId, router])

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="analysis-layout">
      <div className="analysis-top">
        <div className="progress-group">
          <div className="progress-stats">
            <div className="prog-stat">
              <span className="prog-num">{progress.done}</span>
              <span className="prog-label">traités</span>
            </div>
            <div className="prog-stat">
              <span className="prog-num">{progress.failed}</span>
              <span className="prog-label">échecs</span>
            </div>
            <div className="prog-stat">
              <span className="prog-num">{progress.total}</span>
              <span className="prog-label">total</span>
            </div>
            <div className="prog-stat">
              <span className="prog-num">{pct}%</span>
              <span className="prog-label">progression</span>
            </div>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {progress.current && (
            <div className="prog-current">
              {status === 'running' && <span className="dot-pulse" />}
              <span>{progress.current}</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Statut : <strong style={{ color: 'var(--text)' }}>{status}</strong>
        </div>
      </div>

      <div className="logs-wrap" ref={logsRef}>
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.type}`}>
            <span className="log-ts">
              {new Date(l.ts).toLocaleTimeString('fr-FR')}
            </span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline'

type Props = {
  title: string
  description: string
  eta?: string
  backHref?: string
  backLabel?: string
}

/**
 * Page placeholder pour les features prévues au backlog. Cohérente
 * visuellement avec le reste (card + illustration + CTA) plutôt qu'un
 * message "404 pas encore".
 */
export function ComingSoon({ title, description, eta, backHref = '/', backLabel = 'Retour à l\'accueil' }: Props) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ position: 'relative', padding: '48px 32px', textAlign: 'center' }}>
        <div
          style={{
            width: 96, height: 96, margin: '0 auto 20px',
            borderRadius: 24,
            background: 'linear-gradient(135deg, var(--brand-soft) 0%, var(--accent-purple-soft) 100%)',
            display: 'grid', placeItems: 'center',
            color: 'var(--brand)',
          }}
        >
          <WrenchScrewdriverIcon width={44} height={44} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 520, margin: '12px auto 0', lineHeight: 1.6 }}>
          {description}
        </p>
        {eta && (
          <div style={{ marginTop: 16 }}>
            <span className="badge badge-purple">Prévu : {eta}</span>
          </div>
        )}
        <div style={{ marginTop: 24 }}>
          <Link href={backHref} className="btn btn-primary">{backLabel}</Link>
        </div>
      </div>
    </div>
  )
}

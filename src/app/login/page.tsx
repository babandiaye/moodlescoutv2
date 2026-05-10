import { signIn, auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

type Props = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth()
  if (session?.user) redirect('/')

  const params = await searchParams
  const error = params.error

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '3rem 2.5rem',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxWidth: 420,
          width: '90%',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1e3a8a' }}>MoodleScout v2</h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem', marginBottom: '2rem' }}>
          Audit intelligent des cours Moodle — UN-CHK DITSI
        </p>

        {error === 'disabled' && (
          <p style={{ color: '#dc2626', background: '#fee2e2', padding: '0.75rem', borderRadius: 6 }}>
            Compte désactivé. Contactez un administrateur.
          </p>
        )}
        {error && error !== 'disabled' && (
          <p style={{ color: '#dc2626', background: '#fee2e2', padding: '0.75rem', borderRadius: 6 }}>
            Erreur d&apos;authentification. Réessayez ou contactez un administrateur.
          </p>
        )}

        <form
          action={async () => {
            'use server'
            await signIn('keycloak', { redirectTo: '/' })
          }}
        >
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              background: '#1e3a8a',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '1rem',
            }}
          >
            Se connecter avec Keycloak
          </button>
        </form>

        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '1.5rem' }}>
          SSO Universite Numerique Cheikh Hamidou Kane
        </p>
      </div>
    </main>
  )
}

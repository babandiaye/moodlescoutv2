import { signIn, auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

type Props = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}

const PENDING_ID_TOKEN_COOKIE = 'ms-pending-id-token'

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth()
  if (session?.user) redirect('/')

  const params = await searchParams
  const error = params.error

  // Server action : déconnecte la session SSO Keycloak en silence puis
  // ramène à /login. Le cookie ms-pending-id-token (posé par auth.ts au
  // moment du rejet) fournit l'id_token_hint qui rend le logout silencieux
  // côté Keycloak (sinon → page "Voulez-vous vraiment vous déconnecter ?").
  async function signOutAndReturnToLogin() {
    'use server'
    const store = await cookies()
    const idToken = store.get(PENDING_ID_TOKEN_COOKIE)?.value
    store.delete(PENDING_ID_TOKEN_COOKIE)

    const issuer = process.env.KEYCLOAK_ISSUER
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
    if (!issuer) redirect('/login')

    const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`)
    if (idToken) {
      logoutUrl.searchParams.set('id_token_hint', idToken)
    } else if (process.env.KEYCLOAK_CLIENT_ID) {
      // Fallback : pas de hint → Keycloak peut demander confirmation, mais
      // au moins on tente. Le client_id seul ne suffit en général pas pour
      // éviter le prompt sur Keycloak ≥ 18.
      logoutUrl.searchParams.set('client_id', process.env.KEYCLOAK_CLIENT_ID)
    }
    if (appUrl) {
      logoutUrl.searchParams.set('post_logout_redirect_uri', `${appUrl}/login`)
    }
    redirect(logoutUrl.toString())
  }

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
          <ErrorBox
            color="#dc2626"
            bg="#fee2e2"
            title="Compte désactivé"
            message="Votre compte a été désactivé par un administrateur. Contactez la DITSI si nécessaire."
            otherAccountAction={signOutAndReturnToLogin}
          />
        )}
        {error === 'affiliation_required' && (
          <ErrorBox
            color="#92400e"
            bg="#fef3c7"
            title="Accès refusé"
            message={
              <>
                Votre profil ne permet pas l&apos;accès à MoodleScout. Seuls les comptes{' '}
                <strong>Personnel</strong> ou <strong>Tuteur</strong> sont autorisés.
                Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez la DITSI.
              </>
            }
            otherAccountAction={signOutAndReturnToLogin}
          />
        )}
        {error && error !== 'disabled' && error !== 'affiliation_required' && (
          <ErrorBox
            color="#dc2626"
            bg="#fee2e2"
            title="Erreur d'authentification"
            message="Réessayez ou contactez un administrateur."
          />
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
          SSO Université Numérique Cheikh Hamidou Kane
        </p>
      </div>
    </main>
  )
}

/**
 * Encart d'erreur réutilisable. Quand `otherAccountAction` est fournie, ajoute
 * un bouton "Se connecter avec un autre compte" qui passe par prompt=login
 * OIDC : Keycloak réaffiche le formulaire de mot de passe sans page de
 * confirmation, l'utilisateur peut saisir n'importe quel autre compte.
 */
function ErrorBox({
  color,
  bg,
  title,
  message,
  otherAccountAction,
}: {
  color: string
  bg: string
  title: string
  message: React.ReactNode
  otherAccountAction?: () => Promise<void>
}) {
  return (
    <div
      style={{
        color,
        background: bg,
        padding: '0.85rem 1rem',
        borderRadius: 6,
        textAlign: 'left',
        lineHeight: 1.45,
        marginBottom: '1rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '0.9rem' }}>{message}</div>
      {otherAccountAction && (
        <form action={otherAccountAction} style={{ marginTop: 10 }}>
          <button
            type="submit"
            style={{
              padding: '6px 12px',
              background: 'white',
              border: `1px solid ${color}`,
              color,
              borderRadius: 6,
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ↻ Se connecter avec un autre compte
          </button>
        </form>
      )}
    </div>
  )
}

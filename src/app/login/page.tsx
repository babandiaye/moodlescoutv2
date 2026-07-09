import { signIn, auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Image from 'next/image'
import './login.css'

type Props = {
  searchParams: Promise<{ error?: string }>
}

const PENDING_ID_TOKEN_COOKIE = 'ms-pending-id-token'

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth()
  if (session?.user) redirect('/')

  const { error } = await searchParams

  async function signInAction() {
    'use server'
    await signIn('keycloak', { redirectTo: '/' })
  }

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
      logoutUrl.searchParams.set('client_id', process.env.KEYCLOAK_CLIENT_ID)
    }
    if (appUrl) {
      logoutUrl.searchParams.set('post_logout_redirect_uri', `${appUrl}/login`)
    }
    redirect(logoutUrl.toString())
  }

  return (
    <div className="login-root">
      {/* SVG defs : gradient pour la jauge + marque UN-CHK réutilisée via <use> */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1FA84F" />
          </linearGradient>
          <g id="unchkMark">
            <path d="M14 10 v22 a12 12 0 0 0 24 0 V10" fill="none" stroke="#2563EB" strokeWidth="7" strokeLinecap="round" />
            <path d="M34 42 V20 a12 12 0 0 1 24 0 v22" fill="none" stroke="#1FA84F" strokeWidth="7" strokeLinecap="round" />
            <path d="M54 10 v22 a12 12 0 0 0 24 0 V10" fill="none" stroke="#F0860C" strokeWidth="7" strokeLinecap="round" opacity=".95" />
          </g>
        </defs>
      </svg>

      {/* NAVIGATION */}
      <nav className="nav">
        <div className="wrap nav-in">
          <a href="#" className="unchk-logo" aria-label="Université numérique Cheikh Hamidou Kane">
            <Image
              src="/logo-unchk.png"
              alt="Université numérique Cheikh Hamidou Kane"
              width={1181}
              height={280}
              priority
              className="unchk-mark unchk-mark-img"
            />
          </a>

          <div className="nav-right" style={{ marginLeft: 'auto' }}>
            <form action={signInAction}>
              <button type="submit" className="btn-login">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                Se connecter
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <div className="hero-blob">
          <svg viewBox="0 0 92 52"><use href="#unchkMark" /></svg>
        </div>

        <div className="wrap hero-in">
          {/* colonne gauche */}
          <div>
            {error && <ErrorBanner error={error} otherAccountAction={signOutAndReturnToLogin} />}

            <span className="eyebrow">MoodleScout v2</span>
            <h1>
              Audit pédagogique intelligent pour <span className="moodle">Moodle</span>
            </h1>
            <p className="lede">
              Analysez, comprenez et améliorez la qualité de vos cours Moodle grâce à
              l&apos;intelligence artificielle.
            </p>

            <div className="hero-actions">
              <form action={signInAction}>
                <button type="submit" className="btn-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <path d="M5 13l4-9 3 6 3-2 4 9H5z" />
                    <path d="M9 21l2-4M15 21l-2-4" />
                  </svg>
                  Démarrer un audit
                </button>
              </form>
              <a className="btn-outline" href="#fonctionnalites">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M9 8h6M9 12h6M9 16h4" />
                </svg>
                Voir un exemple de rapport
              </a>
            </div>

            <div className="trust">
              <div className="trust-item">
                <span className="tic g">✓</span>
                <div>
                  <b>Analyse complète</b>
                  <span>en quelques minutes</span>
                </div>
              </div>
              <div className="trust-item">
                <span className="tic o">⚙</span>
                <div>
                  <b>Recommandations</b>
                  <span>actionnables</span>
                </div>
              </div>
              <div className="trust-item">
                <span className="tic b">🛡</span>
                <div>
                  <b>Données sécurisées</b>
                  <span>et confidentielles</span>
                </div>
              </div>
            </div>
          </div>

          {/* colonne droite : mockup dashboard */}
          <div className="dash">
            <aside className="dash-side">
              <div className="dash-brand">
                <svg viewBox="0 0 92 52"><use href="#unchkMark" /></svg>
                Moodlescout
              </div>
              <nav className="dnav">
                <a className="on" href="#">
                  <svg viewBox="0 0 24 24"><path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" /></svg>
                  Tableau de bord
                </a>
                <a href="#">
                  <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
                  Audits
                </a>
                <a href="#">
                  <svg viewBox="0 0 24 24"><path d="M4 19V7a2 2 0 012-2h12a2 2 0 012 2v12" /><path d="M4 19a2 2 0 002 2h14" /><path d="M8 9h8" /></svg>
                  Cours
                </a>
                <a href="#">
                  <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>
                  Rapports
                </a>
                <a href="#">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
                  Recommandations
                </a>
                <a href="#">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19 12a7 7 0 00-.2-1.6l2-1.6-2-3.4-2.4 1a7 7 0 00-2.8-1.6L13 2h-4l-.6 2.8a7 7 0 00-2.8 1.6l-2.4-1-2 3.4 2 1.6A7 7 0 005 12" />
                  </svg>
                  Paramètres
                </a>
              </nav>
            </aside>

            <div className="dash-main">
              <div className="dash-head">
                <div>
                  <h3>Tableau de bord</h3>
                  <p>Vue d&apos;ensemble de la qualité pédagogique</p>
                </div>
                <div className="period">
                  Période
                  <span className="sel">
                    Ce mois
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </div>
              </div>

              <div className="kpis">
                <div className="kpi">
                  <div className="gauge">
                    <svg width="62" height="62" viewBox="0 0 62 62">
                      <circle className="track" cx="31" cy="31" r="26" />
                      <circle className="val" cx="31" cy="31" r="26" />
                    </svg>
                    <div className="gnum">82<small>/100</small></div>
                  </div>
                  <div>
                    <span>Score global</span>
                    <span className="badge-bon">✿ Bon</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kico b">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="8" r="3.5" />
                      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
                      <circle cx="17" cy="9" r="2.5" />
                      <path d="M16 14c3 0 6 2 6 5" />
                    </svg>
                  </div>
                  <div>
                    <b>24</b>
                    <span>Cours analysés</span>
                    <span className="delta up">+12 ce mois</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kico g">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <b>78<small>%</small></b>
                    <span>Conformité</span>
                    <span className="delta up">+8%</span>
                  </div>
                </div>
                <div className="kpi">
                  <div className="kico o">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="7" r="4" />
                      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
                    </svg>
                  </div>
                  <div>
                    <b>15</b>
                    <span>Améliorations<br />prioritaires</span>
                  </div>
                </div>
              </div>

              <div className="dash-grid">
                <div className="panel">
                  <h4>Répartition par critère</h4>
                  <Crit label="Alignement pédagogique" pct={85} color="bl" delay="1.2s" />
                  <Crit label="Engagement étudiant" pct={76} color="gr" delay="1.35s" />
                  <Crit label="Évaluation & feedback" pct={68} color="or" delay="1.5s" />
                  <Crit label="Accessibilité" pct={90} color="bl" delay="1.65s" />
                  <Crit label="Ressources pédagogiques" pct={75} color="gr" delay="1.8s" />
                </div>

                <div className="panel">
                  <h4>Recommandations prioritaires</h4>
                  <Reco icon="📝" label="Ajouter des activités d'évaluation" sub="8 cours concernés" bg="var(--orange-soft)" color="var(--orange)" />
                  <Reco icon="💬" label="Améliorer le feedback" sub="5 cours concernés" bg="var(--green-soft)" color="var(--green)" />
                  <Reco icon="📂" label="Rendre les ressources plus accessibles" sub="3 cours concernés" bg="var(--blue-soft)" color="var(--blue)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* FONCTIONNALITÉS */}
      <section className="features" id="fonctionnalites">
        <div className="wrap">
          <div className="f-head">
            <span className="f-eyebrow">Fonctionnalités</span>
            <h2>Tout ce qu&apos;il faut pour un audit efficace</h2>
          </div>
          <div className="f-grid">
            <div className="f-card">
              <div className="f-ico b">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M16 4l2-2M19 7l2-1" /></svg>
              </div>
              <h3>Analyse automatique</h3>
              <p>L&apos;IA analyse vos cours selon des critères pédagogiques reconnus.</p>
            </div>
            <div className="f-card">
              <div className="f-ico g">
                <svg viewBox="0 0 24 24">
                  <circle cx="6" cy="6" r="2.2" /><circle cx="12" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" />
                  <circle cx="6" cy="13" r="2.2" /><circle cx="12" cy="13" r="2.2" /><path d="M16 17l2 2 4-4" />
                </svg>
              </div>
              <h3>Rapports détaillés</h3>
              <p>Des rapports clairs avec des scores et des recommandations.</p>
            </div>
            <div className="f-card">
              <div className="f-ico o">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="4" width="14" height="16" rx="2" />
                  <path d="M9 4v4l3-1.5L15 8V4" />
                  <path d="M9 14h6M9 17h4" />
                </svg>
              </div>
              <h3>Recommandations intelligentes</h3>
              <p>Des suggestions concrètes pour améliorer vos cours.</p>
            </div>
            <div className="f-card">
              <div className="f-ico b">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                  <circle cx="12" cy="11" r="2.5" />
                  <path d="M12 13.5V16" />
                </svg>
              </div>
              <h3>Suivi dans le temps</h3>
              <p>Visualisez vos progrès et l&apos;impact de vos actions.</p>
            </div>
            <div className="f-card">
              <div className="f-ico g">
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="6" width="16" height="14" rx="2" />
                  <path d="M8 6V4h8v2" />
                  <path d="M9 13l2 2 4-4" />
                </svg>
              </div>
              <h3>Conformité assurée</h3>
              <p>Alignez vos cours avec les standards pédagogiques.</p>
            </div>
            <div className="f-card">
              <div className="f-ico o">
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="8" r="3.5" />
                  <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
                  <path d="M17 3.5a3 3 0 010 5.5M20 14c1.5 1 2 2.5 2 4" />
                </svg>
              </div>
              <h3>Sécurisé &amp; confidentiel</h3>
              <p>Vos données sont protégées selon les normes les plus strictes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap foot">
          <div className="foot-mid">
            <b>Moodlescout v2 – Audit pédagogique intelligent pour Moodle</b>
            <p>© {new Date().getFullYear()} Université numérique Cheikh Hamidou KANE. Tous droits réservés.</p>
          </div>
          <div className="foot-contact">
            <h5>Contact</h5>
            <p><a href="mailto:support@unchk.edu.sn">support@unchk.edu.sn</a></p>
          </div>
          <div>
            <h5>Suivez-nous</h5>
            <div className="socials">
              <a href="#" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2 3.77-2C20.6 8.7 21 11.2 21 14v7h-4v-6.2c0-1.5-.03-3.4-2.1-3.4-2.1 0-2.4 1.6-2.4 3.3V21H9z" /></svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg viewBox="0 0 24 24"><path d="M23 7.5s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.6 4 12 4 12 4s-4.6 0-7.7.2c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.8 9.4.8 11.3v1.7c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.9.2 7.6.2 7.6.2s4.6 0 7.7-.2c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.7c0-1.9-.2-3.8-.2-3.8zM9.8 15.3V8.7l6.2 3.3z" /></svg>
              </a>
              <a href="#" aria-label="Twitter / X">
                <svg viewBox="0 0 24 24"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.1L6 22H2.9l7.5-8.6L2.5 2h6.6l4.5 6.4zM17.8 20h1.7L7.3 3.9H5.5z" /></svg>
              </a>
              <a href="#" aria-label="Facebook">
                <svg viewBox="0 0 24 24"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2C16.5 3.1 15.5 3 14.4 3c-2.4 0-4 1.5-4 4.2v2.6H7.7V13h2.7v8z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// =================================================================
// Sous-composants
// =================================================================

function Crit({
  label,
  pct,
  color,
  delay,
}: {
  label: string
  pct: number
  color: 'bl' | 'gr' | 'or'
  delay: string
}) {
  // Custom property `--w` portée par <i> : déclenche l'animation `grow` du CSS.
  const style = { '--w': `${pct}%`, animationDelay: delay } as React.CSSProperties
  return (
    <div className="crit">
      <div className="crit-top">
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div className="cbar">
        <i className={color} style={style} />
      </div>
    </div>
  )
}

function Reco({
  icon,
  label,
  sub,
  bg,
  color,
}: {
  icon: string
  label: string
  sub: string
  bg: string
  color: string
}) {
  return (
    <div className="reco">
      <div className="rico" style={{ background: bg, color }}>{icon}</div>
      <div>
        <b>{label}</b>
        <span>{sub}</span>
      </div>
      <span className="chev">›</span>
    </div>
  )
}

function ErrorBanner({
  error,
  otherAccountAction,
}: {
  error: string
  otherAccountAction: () => Promise<void>
}) {
  if (error === 'affiliation_required') {
    return (
      <div className="err-banner warn">
        <h4>Accès refusé — profil non autorisé</h4>
        <p>
          Votre profil ne permet pas l&apos;accès à MoodleScout. Seuls les comptes{' '}
          <strong>Personnel</strong> ou <strong>Tuteur</strong> sont autorisés. Si vous
          pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez la DITSI.
        </p>
        <form action={otherAccountAction}>
          <button type="submit" className="other">↻ Se connecter avec un autre compte</button>
        </form>
      </div>
    )
  }
  if (error === 'disabled') {
    return (
      <div className="err-banner danger">
        <h4>Compte désactivé</h4>
        <p>Contactez la DITSI si nécessaire.</p>
        <form action={otherAccountAction}>
          <button type="submit" className="other">↻ Se connecter avec un autre compte</button>
        </form>
      </div>
    )
  }
  return (
    <div className="err-banner danger">
      <h4>Erreur d&apos;authentification</h4>
      <p>Réessayez ou contactez un administrateur.</p>
    </div>
  )
}

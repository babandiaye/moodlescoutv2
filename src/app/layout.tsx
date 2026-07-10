import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'
import { TopBar } from '@/components/top-bar'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'MoodleScout',
    // Une page qui exporte sa propre `metadata.title` sera préfixée :
    // `title: 'Rapport d'audit'` → onglet "Rapport d'audit · MoodleScout"
    template: '%s · MoodleScout',
  },
  description: 'Audit intelligent des cours Moodle — UN-CHK DITSI',
  icons: {
    // favicon.ico multi-tailles (16/32/48/64/128) généré depuis une version
    // trimmée + recentrée du SVG → le logo remplit toute la surface du favicon
    // au lieu d'apparaître minuscule à cause du padding transparent du SVG
    // source. Généré via :
    //   convert -density 400 mslogo-transparent.svg -trim -resize 512x512 …
    // À regénérer via public/favicon.ico si le logo change.
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user ?? null

  return (
    <html lang="fr">
      <body>
        {user ? (
          <div className="app-shell">
            <Sidebar role={user.role} />
            <div className="app-main">
              <TopBar fullName={user.fullName} role={user.role} />
              <main className="app-body">{children}</main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}

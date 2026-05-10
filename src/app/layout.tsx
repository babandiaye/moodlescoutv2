import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { TopBar } from '@/components/top-bar'
import './globals.css'

export const metadata: Metadata = {
  title: 'MoodleScout v2 — UN-CHK DITSI',
  description: 'Audit intelligent des cours Moodle',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user ?? null

  return (
    <html lang="fr">
      <body>
        {user ? (
          <div className="app-shell">
            <TopBar fullName={user.fullName} role={user.role} />
            <main className="app-body">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}

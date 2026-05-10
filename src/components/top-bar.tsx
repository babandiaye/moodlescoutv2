'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

type Props = {
  fullName: string
  role: 'admin' | 'auditeur'
}

const NAV_TABS: Array<{ href: string; label: string; matchPrefix: string; adminOnly?: boolean }> = [
  { href: '/', label: 'Accueil', matchPrefix: '/' },
  { href: '/configuration', label: 'Configuration', matchPrefix: '/configuration', adminOnly: true },
  { href: '/audits/new', label: 'Lancer un audit', matchPrefix: '/audits/new' },
  { href: '/audits', label: 'Audits', matchPrefix: '/audits' },
]

export function TopBar({ fullName, role }: Props) {
  const pathname = usePathname()

  const tabs = NAV_TABS.filter(t => !t.adminOnly || role === 'admin')

  const isActive = (tab: (typeof NAV_TABS)[number]) => {
    if (tab.href === '/') return pathname === '/'
    if (tab.href === '/audits') {
      return pathname === '/audits' || (pathname.startsWith('/audits/') && pathname !== '/audits/new')
    }
    return pathname.startsWith(tab.matchPrefix)
  }

  return (
    <header className="topbar">
      <Link href="/" className="topbar-brand">
        <div className="brand-icon">M</div>
        <div>
          <div className="brand-name">MoodleScout</div>
          <div className="brand-sub">UN-CHK DITSI — Audit Intelligent</div>
        </div>
      </Link>

      <nav className="topbar-nav">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`nav-tab ${isActive(tab) ? 'active' : ''}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="topbar-actions">
        <span className="topbar-user">
          <strong>{fullName || '—'}</strong>
          <span style={{ marginLeft: 6, opacity: 0.7 }}>· {role}</span>
        </span>
        <button className="btn-action" onClick={() => signOut({ callbackUrl: '/login' })}>
          Déconnexion
        </button>
      </div>
    </header>
  )
}

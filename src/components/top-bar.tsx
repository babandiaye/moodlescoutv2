'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { UserRole } from '@prisma/client'
import { QuotaBadge } from './quota-badge'

type Props = {
  fullName: string
  role: UserRole
}

type NavGuard = 'adminOnly' | 'canLaunch'

const NAV_TABS: Array<{ href: string; label: string; matchPrefix: string; guard?: NavGuard }> = [
  { href: '/', label: 'Accueil', matchPrefix: '/' },
  { href: '/configuration', label: 'Configuration', matchPrefix: '/configuration', guard: 'adminOnly' },
  { href: '/users', label: 'Utilisateurs', matchPrefix: '/users', guard: 'adminOnly' },
  { href: '/plateformes', label: 'Plateformes', matchPrefix: '/plateformes' },
  { href: '/me/courses', label: 'Mes cours', matchPrefix: '/me' },
  { href: '/audits/course', label: 'Analyser un cours', matchPrefix: '/audits/course', guard: 'canLaunch' },
  { href: '/audits/new', label: 'Lancer un audit', matchPrefix: '/audits/new', guard: 'canLaunch' },
  { href: '/audits', label: 'Audits', matchPrefix: '/audits' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  auditeur: 'Auditeur',
  lecteur: 'Lecteur',
}

export function TopBar({ fullName, role }: Props) {
  const pathname = usePathname()

  const tabs = NAV_TABS.filter(t => {
    if (!t.guard) return true
    if (t.guard === 'adminOnly') return role === 'admin'
    if (t.guard === 'canLaunch') return role === 'admin' || role === 'auditeur'
    return true
  })

  const isActive = (tab: (typeof NAV_TABS)[number]) => {
    if (tab.href === '/') return pathname === '/'
    if (tab.href === '/audits') {
      return (
        pathname === '/audits' ||
        (pathname.startsWith('/audits/') &&
          pathname !== '/audits/new' &&
          pathname !== '/audits/course')
      )
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
        {(role === 'admin' || role === 'auditeur') && <QuotaBadge />}
        <span className="topbar-user">
          <strong>{fullName || '—'}</strong>
          <span style={{ marginLeft: 6, opacity: 0.7 }}>· {ROLE_LABELS[role] ?? role}</span>
        </span>
        <button className="btn-action" onClick={() => signOut({ callbackUrl: '/login' })}>
          Déconnexion
        </button>
      </div>
    </header>
  )
}

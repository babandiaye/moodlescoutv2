'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import {
  Bars3Icon,
  MagnifyingGlassIcon,
  SunIcon,
  BellIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import type { UserRole } from '@prisma/client'
import { QuotaBadge } from './quota-badge'

type Props = {
  fullName: string
  role: UserRole
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  auditeur: 'Auditeur',
  lecteur: 'Lecteur',
}

/**
 * Barre supérieure de la zone main : hamburger (mobile), search globale,
 * toggle thème (visuel), cloche notifications, profil user + menu déconnexion.
 *
 * Le toggle thème est intentionnellement visuel-only pour l'instant — la
 * palette dark n'est pas encore calée. La cloche notif affiche un badge sur
 * les audits `pending` / `running` mais pas de dropdown pour l'instant.
 */
export function TopBar({ fullName, role }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = (fullName || 'U N')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || 'UN'

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-menu-btn"
        aria-label="Menu"
        onClick={() => {
          // Toggle sidebar visibility sur mobile — pas encore implémenté
          // en JS, la sidebar est masquée par media-query CSS.
        }}
      >
        <Bars3Icon width={20} height={20} />
      </button>

      <div className="topbar-search">
        <MagnifyingGlassIcon className="topbar-search-icon" />
        <input
          type="search"
          placeholder="Rechercher…"
          aria-label="Recherche globale"
        />
        <span className="topbar-search-kbd">⌘K</span>
      </div>

      <div className="topbar-actions">
        {(role === 'admin' || role === 'auditeur') && <QuotaBadge />}

        <button
          type="button"
          className="topbar-icon-btn"
          aria-label="Basculer le thème (à venir)"
          title="Toggle thème (bientôt)"
        >
          <SunIcon />
        </button>

        <button
          type="button"
          className="topbar-icon-btn"
          aria-label="Notifications"
          title="Notifications"
        >
          <BellIcon />
          {/* Badge notif — TODO : câbler sur audits en cours */}
        </button>

        <div
          className="topbar-user"
          onClick={() => setMenuOpen(o => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setMenuOpen(o => !o) }}
          style={{ position: 'relative' }}
        >
          <div className="topbar-user-avatar" aria-hidden="true">{initials}</div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{fullName || 'Utilisateur'}</div>
            <div className="topbar-user-role">{ROLE_LABELS[role] ?? role}</div>
          </div>
          <ChevronDownIcon className="topbar-user-caret" />

          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: 'var(--shadow-lg)',
                minWidth: 200,
                zIndex: 100,
                padding: 8,
              }}
            >
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'none',
                  color: 'var(--danger)',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--danger-light)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

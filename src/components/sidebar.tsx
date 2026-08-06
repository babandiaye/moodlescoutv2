'use client'

import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  CpuChipIcon,
  UsersIcon,
  BookOpenIcon,
  PlayIcon,
  CalendarDaysIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import type { UserRole } from '@prisma/client'

type Props = {
  role: UserRole
}

/**
 * Politique visibilité des items :
 *  - 'adminOnly'    : admin uniquement
 *  - 'canLaunch'    : admin + enseignant (mais l'enseignant ne verra PAS
 *                     l'entrée générique "Lancer un audit plateforme" ni
 *                     "Analyser un cours" — voir 'hideFromEnseignant')
 *  - 'hideFromEnseignant' : masqué à l'enseignant qui ne doit voir QUE
 *                     Tableau de bord + Audits + Mes cours dans la sidebar.
 *                     Il pourra lancer un audit uniquement depuis "Mes cours"
 *                     via le bouton "Auditer ce cours" par ligne.
 */
type NavGuard = 'adminOnly' | 'canLaunch' | 'hideFromEnseignant'

type NavItem = {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  guard?: NavGuard
  soon?: boolean
  matchPrefix?: string
}

/**
 * Menu principal. Les items 'Audits planifiés' et 'Rapports' sont marqués
 * comme "Bientôt" — features prévues en P3/P4, on affiche le lien pour la
 * cohérence visuelle avec la maquette, il pointe vers une page placeholder.
 */
const NAV: NavItem[] = [
  { href: '/',              label: 'Tableau de bord',    icon: HomeIcon,                    matchPrefix: '/' },
  { href: '/audits',        label: 'Audits',             icon: ClipboardDocumentListIcon,   matchPrefix: '/audits' },
  { href: '/plateformes',   label: 'Plateformes Moodle', icon: AcademicCapIcon,             guard: 'hideFromEnseignant', matchPrefix: '/plateformes' },
  { href: '/configuration', label: 'Mes Fournisseurs IA', icon: CpuChipIcon,                 matchPrefix: '/configuration' },
  { href: '/users',         label: 'Utilisateurs',       icon: UsersIcon,                   guard: 'adminOnly', matchPrefix: '/users' },
  { href: '/me/courses',    label: 'Mes cours',          icon: BookOpenIcon,                matchPrefix: '/me' },
  { href: '/audits/course', label: 'Analyser un cours',  icon: MagnifyingGlassIcon,         guard: 'hideFromEnseignant', matchPrefix: '/audits/course' },
  { href: '/audits/new',    label: 'Lancer un audit',    icon: PlayIcon,                    guard: 'hideFromEnseignant', matchPrefix: '/audits/new' },
  { href: '/rapports',      label: 'Rapports',           icon: DocumentChartBarIcon,        guard: 'hideFromEnseignant', soon: true, matchPrefix: '/rapports' },
]

const ADMIN_NAV: NavItem[] = [
  { href: '/audits/planifies',           label: 'Audits planifiés', icon: CalendarDaysIcon, guard: 'adminOnly', soon: true, matchPrefix: '/audits/planifies' },
  { href: '/configuration/plateformes',  label: 'Paramètres',       icon: Cog6ToothIcon,    guard: 'adminOnly', matchPrefix: '/configuration/plateformes' },
]

export function Sidebar({ role }: Props) {
  const pathname = usePathname()

  const canSee = (item: NavItem) => {
    if (!item.guard) return true
    if (item.guard === 'adminOnly') return role === 'admin'
    if (item.guard === 'canLaunch') return role === 'admin' || role === 'enseignant'
    // L'enseignant a une sidebar volontairement épurée : uniquement Tableau
    // de bord + Audits + Mes cours. Tout le reste (Plateformes, Analyser un
    // cours, Lancer un audit, Rapports) est masqué. Il peut auditer un cours
    // via le bouton dédié sur /me/courses.
    if (item.guard === 'hideFromEnseignant') return role !== 'enseignant'
    return true
  }

  const isActive = (item: NavItem) => {
    const prefix = item.matchPrefix ?? item.href
    if (prefix === '/') return pathname === '/'
    // Cas particulier : /audits/new et /audits/course ne matchent PAS /audits.
    if (prefix === '/audits') {
      return (
        pathname === '/audits' ||
        (pathname.startsWith('/audits/') &&
          pathname !== '/audits/new' &&
          pathname !== '/audits/course' &&
          pathname !== '/audits/planifies' &&
          pathname !== '/audits/compare')
      )
    }
    // /configuration = LLM configs uniquement. Ne pas activer si on est sur
    // /configuration/plateformes (qui a son propre entrée "Paramètres").
    if (prefix === '/configuration') {
      return pathname === '/configuration'
    }
    return pathname.startsWith(prefix)
  }

  const main = NAV.filter(canSee)
  const admin = ADMIN_NAV.filter(canSee)

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand logo-only" aria-label="MoodleScout — UN-CHK DITSI">
        {/* SVG vectoriel : nette à toute taille, fond transparent → se pose
            directement sur le navy de la sidebar sans plaque blanche. */}
        <img src="/mslogo-transparent.svg" alt="MoodleScout" className="sidebar-brand-img" />
      </Link>

      <nav className="sidebar-nav">
        {main.map(item => {
          const Icon = item.icon
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.soon ? '/rapports' : item.href}
              className={`sidebar-nav-item ${active ? 'active' : ''}`}
            >
              <Icon className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">{item.label}</span>
              {item.soon && <span className="sidebar-nav-badge soon">Bientôt</span>}
            </Link>
          )
        })}

        {admin.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--sidebar-divider)', margin: '12px 4px 8px' }} />
            {admin.map(item => {
              const Icon = item.icon
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.soon ? '/audits/planifies' : item.href}
                  className={`sidebar-nav-item ${active ? 'active' : ''}`}
                >
                  <Icon className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{item.label}</span>
                  {item.soon && <span className="sidebar-nav-badge soon">Bientôt</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="sidebar-promo">
        <div className="sidebar-promo-icon">
          <ShieldCheckIcon />
        </div>
        <div className="sidebar-promo-title">Audit intelligent</div>
        <div className="sidebar-promo-desc">Sécurisez. Analysez. Améliorez.</div>
      </div>
    </aside>
  )
}

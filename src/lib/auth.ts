import NextAuth from 'next-auth'
import KeycloakProvider from 'next-auth/providers/keycloak'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@prisma/client'

const ADMIN_DIRECTION = process.env.ADMIN_DIRECTION ?? 'DITSI'

// Affiliations Keycloak autorisées à se connecter à MoodleScout.
// Le claim `affiliation` est renvoyé par senid.unchk.sn dans le token ID.
// Tout autre profil (typiquement "Étudiant") est refusé AVANT toute écriture
// en BD — on ne veut pas créer de compte inutile pour des refusés.
const ALLOWED_AFFILIATIONS = new Set(['Personnel', 'Tuteur'])

// Nom du cookie qui stocke temporairement l'id_token Keycloak quand un
// utilisateur est rejeté au signIn. Réutilisé par la Server Action
// "Se connecter avec un autre compte" pour faire un logout SILENCIEUX
// (avec id_token_hint) — sans la page de confirmation Keycloak.
const PENDING_ID_TOKEN_COOKIE = 'ms-pending-id-token'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      if (!profile?.sub) return false

      // Restriction Keycloak : seuls "Personnel" et "Tuteur" peuvent accéder.
      // Retourne une URL de redirection custom pour que /login affiche un
      // message explicite plutôt que l'erreur générique NextAuth.
      const affiliation = (profile as { affiliation?: string }).affiliation ?? null
      if (!affiliation || !ALLOWED_AFFILIATIONS.has(affiliation)) {
        // Avant de rejeter : on stocke l'id_token Keycloak dans un cookie
        // httpOnly court (5 min). Le bouton "Changer de compte" l'utilisera
        // comme id_token_hint pour un logout silencieux côté Keycloak.
        // Sans ce hint, Keycloak affiche une page "Voulez-vous vous déconnecter ?".
        if (account?.id_token) {
          try {
            const store = await cookies()
            store.set(PENDING_ID_TOKEN_COOKIE, account.id_token, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              maxAge: 300,
              path: '/',
            })
          } catch {
            // Le contexte ne permet pas d'écrire un cookie : on continue
            // quand même — la confirmation Keycloak s'affichera, c'est tout.
          }
        }
        return '/login?error=affiliation_required'
      }

      const direction = (profile as { direction?: string }).direction ?? null
      const isAdmin = direction === ADMIN_DIRECTION

      // Upsert : on ne touche au rôle qu'à la CRÉATION (premier login),
      // pour ne pas écraser des changements manuels d'admin sur les logins suivants.
      await prisma.user.upsert({
        where: { kcSub: profile.sub },
        update: {
          email:             profile.email ?? '',
          preferredUsername: (profile as { preferred_username?: string }).preferred_username ?? '',
          givenName:         (profile as { given_name?: string }).given_name ?? null,
          familyName:        (profile as { family_name?: string }).family_name ?? null,
          fullName:          profile.name ?? null,
          direction,
          lastLogin:         new Date(),
        },
        create: {
          kcSub:             profile.sub,
          email:             profile.email ?? '',
          preferredUsername: (profile as { preferred_username?: string }).preferred_username ?? '',
          givenName:         (profile as { given_name?: string }).given_name ?? null,
          familyName:        (profile as { family_name?: string }).family_name ?? null,
          fullName:          profile.name ?? null,
          direction,
          role:              isAdmin ? 'admin' : 'enseignant',
          lastLogin:         new Date(),
        },
      })

      return true
    },

    async session({ session, token }) {
      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { kcSub: token.sub },
        })
        if (user) {
          session.user.id        = user.id
          session.user.role      = user.role as UserRole
          session.user.direction = user.direction
          session.user.isActive  = user.isActive
          session.user.fullName  = user.fullName ?? ''
        }
      }
      return session
    },

    async jwt({ token, profile, account }) {
      if (profile) {
        token.sub = profile.sub ?? undefined
      }
      // Conserver l'id_token Keycloak pour la déconnexion complète SSO
      if (account?.id_token) {
        token.id_token = account.id_token
      }
      return token
    },
  },
  events: {
    // Déconnexion complète : invalide aussi la session côté Keycloak
    async signOut(message) {
      const idToken = 'token' in message ? (message.token as { id_token?: string })?.id_token : null
      if (idToken && process.env.KEYCLOAK_ISSUER) {
        try {
          const logoutUrl = new URL(
            `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`
          )
          logoutUrl.searchParams.set('id_token_hint', idToken)
          if (process.env.NEXTAUTH_URL) {
            logoutUrl.searchParams.set('post_logout_redirect_uri', `${process.env.NEXTAUTH_URL}/login`)
          }
          await fetch(logoutUrl.toString())
        } catch {
          // Ignorer — la session NextAuth est déjà supprimée côté app
        }
      }
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})

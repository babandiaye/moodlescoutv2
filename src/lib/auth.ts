import NextAuth from 'next-auth'
import KeycloakProvider from 'next-auth/providers/keycloak'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@prisma/client'

const ADMIN_DIRECTION = process.env.ADMIN_DIRECTION ?? 'DITSI'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.sub) return false

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
          role:              isAdmin ? 'admin' : 'auditeur',
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

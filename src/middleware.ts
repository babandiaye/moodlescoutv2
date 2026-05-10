import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Routes publiques
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health')
  ) {
    return NextResponse.next()
  }

  const isApi = pathname.startsWith('/api/')

  if (!isLoggedIn) {
    if (isApi) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (!req.auth?.user?.isActive) {
    if (isApi) {
      return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/login?error=disabled', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Exclut les assets statiques (fichiers Next.js + tout fichier avec extension courante)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}

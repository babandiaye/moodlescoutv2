import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const a = await requireAuth({ role: 'admin' })
  if (!a.ok) return a.response

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      email: true,
      preferredUsername: true,
      givenName: true,
      familyName: true,
      fullName: true,
      direction: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLogin: true,
      _count: { select: { auditSessions: true } },
    },
  })

  return NextResponse.json({ users })
}

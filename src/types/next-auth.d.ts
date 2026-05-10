import type { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      role: UserRole
      direction: string | null
      isActive: boolean
      fullName: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id_token?: string
  }
}

export {}

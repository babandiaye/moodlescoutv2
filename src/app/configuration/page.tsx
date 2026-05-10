import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PlatformsSection } from '@/components/platforms-section'
import { LlmConfigsSection } from '@/components/llm-configs-section'

export const dynamic = 'force-dynamic'

export default async function ConfigurationPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/')

  const [platforms, llmConfigs] = await Promise.all([
    prisma.moodlePlatform.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, url: true, version: true, createdAt: true },
    }),
    prisma.llmConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        provider: true,
        apiUrl: true,
        model: true,
        isDefault: true,
      },
    }),
  ])

  return (
    <div className="flex-col-20">
      <PlatformsSection initial={platforms} />
      <LlmConfigsSection initial={llmConfigs} />
    </div>
  )
}

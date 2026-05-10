// Test direct de getUsersTotalCount sur une plateforme cible (par nom).
// Usage : pnpm tsx scripts/inspect-users-count.ts "P6 MASTER"
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const name = process.argv[2]
if (!name) {
  console.error('Usage : pnpm tsx scripts/inspect-users-count.ts "<NOM_PLATEFORME>"')
  process.exit(1)
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const { getUsersTotalCount } = await import('../src/lib/moodle')

  const p = await prisma.moodlePlatform.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
  })
  if (!p) {
    console.error(`Aucune plateforme trouvée pour "${name}"`)
    process.exit(1)
  }
  console.log(`Plateforme : ${p.name}  ->  ${p.url}`)

  const token = decrypt(p.tokenEnc)
  console.log(`Token : ${token.slice(0, 8)}…`)
  console.log(`Auth methods : ${process.env.MOODLE_AUTH_METHODS ?? '(défaut: manual,oidc)'}\n`)

  const start = Date.now()
  try {
    const r = await getUsersTotalCount(p.url, token)
    const ms = Date.now() - start
    console.log(`Durée appel : ${ms}ms`)
    console.log(`Résultat   : ${JSON.stringify(r, null, 2)}`)
  } catch (err) {
    console.error('Erreur :', (err as Error).message)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

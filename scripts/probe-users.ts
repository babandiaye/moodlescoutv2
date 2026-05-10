// Probe rapide de core_user_get_users sur une plateforme pour mesurer
// le coût d'un appel avec un petit limitnum vs sans limite.
import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

const name = process.argv[2]
if (!name) {
  console.error('Usage : pnpm tsx scripts/probe-users.ts "<NOM_PLATEFORME>"')
  process.exit(1)
}

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { decrypt } = await import('../src/lib/crypto')
  const axios = (await import('axios')).default

  const p = await prisma.moodlePlatform.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
  })
  if (!p) {
    console.error(`Aucune plateforme trouvée pour "${name}"`)
    process.exit(1)
  }
  const token = decrypt(p.tokenEnc)
  const wsUrl = `${p.url.replace(/\/+$/, '')}/webservice/rest/server.php`
  console.log(`URL : ${wsUrl}\n`)

  async function call(label: string, params: Record<string, string | number>, timeoutMs = 30000) {
    const formData = new URLSearchParams()
    formData.set('wstoken', token)
    formData.set('wsfunction', 'core_user_get_users')
    formData.set('moodlewsrestformat', 'json')
    for (const [k, v] of Object.entries(params)) formData.set(k, String(v))

    const start = Date.now()
    try {
      const r = await axios.post(wsUrl, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: timeoutMs,
        validateStatus: () => true,
      })
      const ms = Date.now() - start
      const body = r.data
      if (body && typeof body === 'object' && 'exception' in body) {
        console.log(`[${label}] ❌ ${ms}ms — ${body.errorcode} : ${body.message}`)
        return
      }
      const users = Array.isArray(body?.users) ? body.users : []
      console.log(`[${label}] ✅ ${ms}ms — ${users.length} users retournés (HTTP ${r.status})`)
    } catch (err: any) {
      const ms = Date.now() - start
      console.log(`[${label}] ⚠ ${ms}ms — ${err.code ?? err.message}`)
    }
  }

  // 1) Sanity check : auth=manual, limitnum=1 (ultra-rapide si endpoint marche)
  await call('manual / limitnum=1', {
    'criteria[0][key]': 'auth',
    'criteria[0][value]': 'manual',
    limitnum: 1,
    limitfrom: 0,
  })

  // 2) auth=manual, limitnum=10 (poids minimal mais réel)
  await call('manual / limitnum=10', {
    'criteria[0][key]': 'auth',
    'criteria[0][value]': 'manual',
    limitnum: 10,
    limitfrom: 0,
  })

  // 3) auth=oidc, limitnum=1
  await call('oidc   / limitnum=1', {
    'criteria[0][key]': 'auth',
    'criteria[0][value]': 'oidc',
    limitnum: 1,
    limitfrom: 0,
  })

  // 4) le call actuel (limitnum=0 = pas de limite côté serveur)
  await call('manual / limitnum=0', {
    'criteria[0][key]': 'auth',
    'criteria[0][value]': 'manual',
    limitnum: 0,
    limitfrom: 0,
  }, 60000)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

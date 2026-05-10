import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

// Validation au chargement du module : fail fast plutôt qu'erreur obscure au runtime
const rawKey = process.env.ENCRYPTION_KEY
if (!rawKey) {
  throw new Error(
    "ENCRYPTION_KEY manquante dans les variables d'environnement. " +
    'Générer avec : openssl rand -hex 32'
  )
}
if (rawKey.length !== 64) {
  throw new Error(
    `ENCRYPTION_KEY invalide : attendu 64 caractères hexadécimaux (32 bytes), reçu ${rawKey.length}. ` +
    'Régénérer avec : openssl rand -hex 32'
  )
}
const KEY = Buffer.from(rawKey, 'hex')

/**
 * Chiffre un texte en AES-256-GCM. Retourne "iv:tag:ciphertext" en hex.
 * Utilisé pour stocker les tokens Moodle et les clés API LLM en base.
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Déchiffre une chaîne au format "iv:tag:ciphertext".
 * Lance une erreur si la clé a changé ou si le payload est corrompu.
 */
export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, dataHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

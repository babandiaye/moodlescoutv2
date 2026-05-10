import axios from 'axios'

export const AUDIT_PROMPT = `Tu es expert en ingénierie pédagogique et en OCR. Analyse ce cours Moodle (UN-CHK, Sénégal).
{img_note}

CONTENU:
{content}

ANALYSE D'IMAGES — PRIORITÉ ABSOLUE:
Si des images sont jointes, tu DOIS extraire tous les textes visibles avec précision:
- Nom complet du professeur/enseignant (prénom ET nom)
- Titre du cours ou matière affiché
- Département, filière ou spécialité (ex: MIC, IDA, AGN)
- Code cours si visible
- Institution ou logo
- Tout autre texte visible (même partiel)
Même si le texte est petit ou en arrière-plan, extrais-le.

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backticks):
{"description_courte":"...","objectifs_pedagogiques":["..."],"public_cible":"...","niveau":"débutant|intermédiaire|avancé","duree_estimee":"...","langue":"Français","domaine":"...","technologies_utilisees":["..."],"competences_visees":["..."],"structure_commentaire":"...","points_forts":["..."],"points_faibles":["..."],"recommandations":["..."],"pertinence_contenu":7,"qualite_evaluation":6,"structure_pedagogique":8,"engagement_prevu":7,"animateurs_detectes":[{"nom":"...","email":"...","role":"Enseignant","departement":"...","bio":"..."}],"infos_images":"texte extrait des images","score_global":70,"justification_score":"..."}`

export type AuditAiResult = {
  description_courte?: string
  objectifs_pedagogiques?: string[]
  public_cible?: string
  niveau?: string
  duree_estimee?: string
  langue?: string
  domaine?: string
  technologies_utilisees?: string[]
  competences_visees?: string[]
  structure_commentaire?: string
  points_forts?: string[]
  points_faibles?: string[]
  recommandations?: string[]
  pertinence_contenu?: number
  qualite_evaluation?: number
  structure_pedagogique?: number
  engagement_prevu?: number
  animateurs_detectes?: Array<{
    nom?: string
    email?: string
    role?: string
    departement?: string
    bio?: string
  }>
  infos_images?: string
  score_global?: number
  justification_score?: string
}

const FALLBACK: AuditAiResult = {
  description_courte: 'Analyse indisponible',
  score_global: 0,
  pertinence_contenu: 0,
  qualite_evaluation: 0,
  structure_pedagogique: 0,
  engagement_prevu: 0,
  animateurs_detectes: [],
  recommandations: [],
  objectifs_pedagogiques: [],
  points_forts: [],
  points_faibles: [],
}

export function parseAiResponse(raw: string): AuditAiResult {
  if (!raw) return { ...FALLBACK }
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        // fallthrough
      }
    }
  }
  return { ...FALLBACK }
}

function buildPrompt(content: string, imagesCount: number, maxContent: number) {
  const imgNote =
    imagesCount > 0
      ? `${imagesCount} image(s) jointe(s) — extrais tous les textes visibles.`
      : ''
  return AUDIT_PROMPT.replace('{content}', content.slice(0, maxContent)).replace(
    '{img_note}',
    imgNote,
  )
}

function detectImageMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  return 'image/jpeg'
}

const MULTIMODAL_KEYWORDS = ['llava', 'bakllava', 'moondream', 'gemma3', 'vision']

export async function callOllama(opts: {
  apiUrl: string
  apiKey?: string
  model: string
  content: string
  images: Buffer[]
}): Promise<string> {
  const { apiUrl, apiKey, model, content, images } = opts
  const cleanUrl = apiUrl.replace(/\/+$/, '')
  const isMultimodal = MULTIMODAL_KEYWORDS.some(k => model.toLowerCase().includes(k))

  const payload: Record<string, any> = {
    model,
    prompt: buildPrompt(content, images.length, 3500),
    stream: false,
    options: { temperature: 0.1, num_predict: 2500 },
  }
  if (images.length && isMultimodal) {
    payload.images = images.slice(0, 4).map(b => b.toString('base64'))
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await axios.post(`${cleanUrl}/api/generate`, payload, {
    headers,
    timeout: 180000,
  })
  return String(res.data?.response ?? '')
}

export async function listOllamaModels(opts: {
  apiUrl: string
  apiKey?: string
}): Promise<string[]> {
  const cleanUrl = opts.apiUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = {}
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`
  const res = await axios.get(`${cleanUrl}/api/tags`, { headers, timeout: 10000 })
  const models = res.data?.models
  if (!Array.isArray(models)) return []
  return models.map((m: any) => String(m.name ?? '')).filter(Boolean)
}

export async function callAnthropic(opts: {
  apiKey: string
  model: string
  content: string
  images: Buffer[]
}): Promise<string> {
  const { apiKey, model, content, images } = opts
  const messageContent: any[] = []
  for (const img of images.slice(0, 5)) {
    messageContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: detectImageMime(img),
        data: img.toString('base64'),
      },
    })
  }
  messageContent.push({
    type: 'text',
    text: buildPrompt(content, images.length, 5000),
  })

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: messageContent }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 180000,
    },
  )
  const blocks = res.data?.content
  if (Array.isArray(blocks) && blocks[0]?.text) return String(blocks[0].text)
  return ''
}

export type LlmRunOpts = {
  provider: 'ollama' | 'anthropic'
  apiUrl?: string | null
  apiKey?: string | null
  model: string
  content: string
  images: Buffer[]
}

export async function runLlm(opts: LlmRunOpts): Promise<AuditAiResult> {
  try {
    let raw: string
    if (opts.provider === 'anthropic') {
      if (!opts.apiKey) throw new Error('Clé Anthropic manquante')
      raw = await callAnthropic({
        apiKey: opts.apiKey,
        model: opts.model,
        content: opts.content,
        images: opts.images,
      })
    } else {
      if (!opts.apiUrl) throw new Error('URL Ollama manquante')
      raw = await callOllama({
        apiUrl: opts.apiUrl,
        apiKey: opts.apiKey ?? undefined,
        model: opts.model,
        content: opts.content,
        images: opts.images,
      })
    }
    return parseAiResponse(raw)
  } catch (err) {
    const msg = (err as Error).message
    return {
      ...FALLBACK,
      description_courte: `Erreur IA: ${msg.slice(0, 80)}`,
    }
  }
}

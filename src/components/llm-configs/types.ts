export type LlmConfig = {
  id: string
  name: string
  provider: string
  apiUrl: string | null
  model: string
  isDefault: boolean
  isActive: boolean
}

export type Provider = 'ollama' | 'anthropic'

export const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const

export type TestResult =
  | 'loading'
  | {
      ok: true
      latencyMs: number
      modelsCount?: number
      configuredModelAvailable?: boolean
      configuredModel?: string
      sampleModels?: string[]
    }
  | { ok: false; error: string; latencyMs?: number }

export type ModelsState = {
  loading?: boolean
  list?: string[]
  error?: string
}

export type EditState = {
  name: string
  apiUrl: string
  apiKey: string
  model: string
  saving?: boolean
  err?: string | null
  availableModels?: string[]
  loadingModels?: boolean
}

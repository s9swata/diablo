export interface Env {
  AI: Ai
  USAGE_KV?: KVNamespace
  ADMIN_KEY?: string
}

export interface CompletionRequest {
  prefix: string
  suffix: string
  language?: string
  max_tokens?: number
  model?: string
}

export interface ChatRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  stream?: boolean
  max_tokens?: number
  model?: string
}

export interface ApplyRequest {
  original: string
  blocks: { search: string; replace: string }[]
}

export interface EmbedRequest {
  texts: string[]
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status, headers: corsHeaders() })
}

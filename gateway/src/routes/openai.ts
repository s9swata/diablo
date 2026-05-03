import type { Env } from '../types'
import { corsHeaders } from '../types'
import {
  CHAT_MODELS,
  COMPLETION_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_COMPLETION_MODEL,
  DEFAULT_EMBED_MODEL,
  EMBEDDING_MODELS,
  MODELS,
} from '../models'
import { logUsage } from '../usage'

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type?: string; text?: string }>
}

type ChatCompletionRequest = {
  model?: string
  messages?: OpenAiMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
}

type CompletionRequest = {
  model?: string
  prompt?: string
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
}

type EmbeddingRequest = {
  model?: string
  input?: string | string[]
}

const encoder = new TextEncoder()

export async function handleOpenAi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'GET' && pathname === '/v1/models') return handleModels()
  if (request.method === 'GET' && pathname.startsWith('/v1/models/')) return handleModel(pathname)
  if (request.method !== 'POST') return openAiError('Method not allowed', 405)

  switch (pathname) {
    case '/v1/chat/completions':
      return handleChatCompletions(request, env)
    case '/v1/completions':
      return handleCompletions(request, env)
    case '/v1/embeddings':
      return handleEmbeddings(request, env)
    default:
      return openAiError('Not found', 404)
  }
}

function handleModels(): Response {
  return Response.json({
    object: 'list',
    data: MODELS.map(model => ({
      id: model.id,
      object: 'model',
      created: 0,
      owned_by: 'cloudflare',
    })),
  }, { headers: corsHeaders() })
}

function handleModel(pathname: string): Response {
  const id = decodeURIComponent(pathname.slice('/v1/models/'.length))
  const model = MODELS.find(item => item.id === id)
  if (!model) return openAiError(`unknown model: ${id}`, 404, 'model')

  return Response.json({
    id: model.id,
    object: 'model',
    created: 0,
    owned_by: 'cloudflare',
  }, { headers: corsHeaders() })
}

async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  const body = await request.json<ChatCompletionRequest>().catch(() => null)
  if (!body?.messages?.length) return openAiError('messages required', 400, 'messages')

  const model = body.model ?? DEFAULT_CHAT_MODEL
  if (!CHAT_MODELS.some(m => m.id === model)) return openAiError(`unknown chat model: ${model}`, 400, 'model')

  const messages = body.messages.map(message => ({
    role: message.role,
    content: normalizeContent(message.content),
  }))
  const id = makeId('chatcmpl')
  const created = now()
  const payload = generationPayload({
    messages,
    max_tokens: body.max_tokens ?? 4096,
    stream: body.stream === true,
    temperature: body.temperature,
    top_p: body.top_p,
  })

  await logUsage(env, 'v1/chat/completions', model)

  if (body.stream === true) {
    const upstream = await env.AI.run(model, payload as any) as unknown as ReadableStream
    console.log('[openai.chat.stream.raw]', { model, payload })
    return new Response(toOpenAiSse(upstream, id, created, model, 'chat'), {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }

  const response = await env.AI.run(model, payload as any)
  console.log('[openai.chat.raw]', response)
  const content = extractContent(response)

  return Response.json({
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: zeroUsage(),
  }, { headers: corsHeaders() })
}

async function handleCompletions(request: Request, env: Env): Promise<Response> {
  const body = await request.json<CompletionRequest>().catch(() => null)
  if (!body?.prompt) return openAiError('prompt required', 400, 'prompt')

  const model = body.model ?? DEFAULT_COMPLETION_MODEL
  if (!COMPLETION_MODELS.some(m => m.id === model)) return openAiError(`unknown completion model: ${model}`, 400, 'model')

  const id = makeId('cmpl')
  const created = now()
  const payload = generationPayload({
    prompt: body.prompt,
    max_tokens: body.max_tokens ?? 256,
    stream: body.stream === true,
    temperature: body.temperature,
    top_p: body.top_p,
  })

  await logUsage(env, 'v1/completions', model)

  if (body.stream === true) {
    const upstream = await env.AI.run(model, payload as any) as unknown as ReadableStream
    console.log('[openai.completions.stream.raw]', { model, payload })
    return new Response(toOpenAiSse(upstream, id, created, model, 'completion'), {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }

  const response = await env.AI.run(model, payload as any)
  console.log('[openai.completions.raw]', response)
  const text = extractContent(response)

  return Response.json({
    id,
    object: 'text_completion',
    created,
    model,
    choices: [{ text, index: 0, finish_reason: 'stop' }],
    usage: zeroUsage(),
  }, { headers: corsHeaders() })
}

async function handleEmbeddings(request: Request, env: Env): Promise<Response> {
  const body = await request.json<EmbeddingRequest>().catch(() => null)
  if (body?.input === undefined) return openAiError('input required', 400, 'input')

  const model = body.model ?? DEFAULT_EMBED_MODEL
  if (!EMBEDDING_MODELS.some(m => m.id === model)) return openAiError(`unknown embedding model: ${model}`, 400, 'model')

  const inputs = Array.isArray(body.input) ? body.input : [body.input]
  if (inputs.length === 0) return openAiError('input must contain at least one item', 400, 'input')
  if (inputs.length > 500) return openAiError('max 500 input items per request', 400, 'input')

  await logUsage(env, 'v1/embeddings', model)

  const embeddings: number[][] = []
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100)
    const response = await env.AI.run(model, { text: batch } as any)
    console.log('[openai.embeddings.raw]', response)
    embeddings.push(...(((response as any).data ?? []) as number[][]))
  }

  return Response.json({
    object: 'list',
    data: embeddings.map((embedding, index) => ({
      object: 'embedding',
      index,
      embedding,
    })),
    model,
    usage: zeroUsage(),
  }, { headers: corsHeaders() })
}

function generationPayload<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as T
}

function normalizeContent(content: OpenAiMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter(part => part.type === 'text' || part.text)
    .map(part => part.text ?? '')
    .join('')
}

function extractContent(response: unknown): string {
  const value = response as any
  return value?.choices?.[0]?.message?.content ??
    value?.choices?.[0]?.text ??
    value?.response ??
    ''
}

function toOpenAiSse(
  upstream: ReadableStream,
  id: string,
  created: number,
  model: string,
  kind: 'chat' | 'completion'
): ReadableStream {
  let buffer = ''

  return upstream.pipeThrough(new TransformStream<unknown, Uint8Array>({
    start(controller) {
      if (kind === 'chat') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })}\n\n`))
      }
    },
    transform(chunk, controller) {
      const decoded = decodeStreamChunk(chunk)
      console.log('[openai.stream.chunk.raw]', decoded)
      buffer += decoded
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) writeStreamEvent(event, controller, id, created, model, kind)
    },
    flush(controller) {
      if (buffer.trim()) writeStreamEvent(buffer, controller, id, created, model, kind)
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalStreamChunk(id, created, model, kind))}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  }))
}

function decodeStreamChunk(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  return new TextDecoder().decode(chunk as BufferSource, { stream: true })
}

function writeStreamEvent(
  event: string,
  controller: TransformStreamDefaultController<Uint8Array>,
  id: string,
  created: number,
  model: string,
  kind: 'chat' | 'completion'
) {
  const dataLines = event
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())

  const payload = dataLines.length > 0 ? dataLines.join('\n') : event.trim()
  if (!payload || payload === '[DONE]') return

  const token = extractStreamToken(payload)
  if (!token) return

  const chunk = kind === 'chat'
    ? {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
    }
    : {
      id,
      object: 'text_completion',
      created,
      model,
      choices: [{ text: token, index: 0, finish_reason: null }],
    }

  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
}

function finalStreamChunk(id: string, created: number, model: string, kind: 'chat' | 'completion') {
  if (kind === 'chat') {
    return {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }
  }

  return {
    id,
    object: 'text_completion',
    created,
    model,
    choices: [{ text: '', index: 0, finish_reason: 'stop' }],
  }
}

function extractStreamToken(payload: string): string {
  try {
    const json = JSON.parse(payload)
    return json?.choices?.[0]?.delta?.content ??
      json?.choices?.[0]?.text ??
      json?.delta?.content ??
      json?.text ??
      json?.response ??
      ''
  } catch {
    return payload
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

function zeroUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
}

function openAiError(message: string, status = 400, param: string | null = null): Response {
  return Response.json({
    error: {
      message,
      type: status === 401 ? 'authentication_error' : 'invalid_request_error',
      param,
      code: null,
    },
  }, { status, headers: corsHeaders() })
}

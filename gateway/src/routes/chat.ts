import type { Env, ChatRequest } from '../types'
import { corsHeaders, err } from '../types'
import { DEFAULT_CHAT_MODEL, isValidModel, CHAT_MODELS } from '../models'
import { logUsage } from '../usage'

const SYSTEM_PROMPT = `You are Diablo, an expert AI coding agent embedded in a code editor.
You help users understand, write, and refactor code.
When suggesting code changes, always use search/replace blocks in this exact format:

<<<SEARCH>>>
<exact lines to find>
<<<REPLACE>>>
<new lines>
<<<END>>>

You may use multiple blocks for multiple changes. Be precise — SEARCH must match the file exactly.`

export async function handleChat(req: Request, env: Env): Promise<Response> {
  const body = await req.json<ChatRequest>().catch(() => null)
  if (!body?.messages?.length) return err('messages required')

  let model = body.model ?? DEFAULT_CHAT_MODEL
  if (body.model && !isValidModel(body.model)) {
    const valid = CHAT_MODELS.map(m => m.id)
    if (!valid.includes(body.model)) return err(`unknown model. valid: ${valid.join(', ')}`)
    model = body.model
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...body.messages,
  ]

  await logUsage(env, 'chat', model)

  if (body.stream !== false) {
    const stream = await env.AI.run(model, {
      messages,
      max_tokens: body.max_tokens ?? 4096,
      stream: true,
    } as any) as unknown as ReadableStream

    return new Response(stream, {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }

  const response = await env.AI.run(model, {
    messages,
    max_tokens: body.max_tokens ?? 4096,
  } as any)

  const content =
    (response as any).choices?.[0]?.message?.content ??
    (response as any).response ??
    ''

  return Response.json({ content, model }, { headers: corsHeaders() })
}

import type { Env, CompletionRequest } from '../types'
import { corsHeaders, err } from '../types'
import { DEFAULT_COMPLETION_MODEL, isValidModel } from '../models'
import { logUsage } from '../usage'

// Qwen2.5-Coder FIM special tokens
const FIM_PREFIX = '<|fim_prefix|>'
const FIM_SUFFIX = '<|fim_suffix|>'
const FIM_MIDDLE = '<|fim_middle|>'

export async function handleCompletions(req: Request, env: Env): Promise<Response> {
  const body = await req.json<CompletionRequest>().catch(() => null)
  if (!body?.prefix) return err('prefix required')

  const model = body.model && isValidModel(body.model) ? body.model : DEFAULT_COMPLETION_MODEL

  const prompt = `${FIM_PREFIX}${body.prefix}${FIM_SUFFIX}${body.suffix ?? ''}${FIM_MIDDLE}`

  await logUsage(env, 'completions', model)

  const response = await env.AI.run(model, {
    prompt,
    max_tokens: body.max_tokens ?? 256,
    stream: false,
  } as any)

  const text = (response as any).response ?? ''
  const completion = text.split('<|fim_end|>')[0].trimEnd()

  return Response.json({ completion, model }, { headers: corsHeaders() })
}

import type { Env, ApplyRequest } from '../types'
import { corsHeaders, err } from '../types'

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export async function handleApply(req: Request, env: Env): Promise<Response> {
  const body = await req.json<ApplyRequest>().catch(() => null)
  if (!body?.original) return err('original required')
  if (!body?.blocks?.length) return err('blocks required')

  // Try deterministic apply first — no LLM needed if search text is exact
  const fast = applyDeterministic(body.original, body.blocks)
  if (fast.ok) return Response.json({ result: fast.result }, { headers: corsHeaders() })

  // Fallback: ask the fast LLM to apply the blocks
  const prompt = buildApplyPrompt(body.original, body.blocks)
  const response = await env.AI.run(MODEL, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8192,
  } as any)

  const result = (response as any).response ?? ''
  const extracted = extractCodeBlock(result) ?? result

  return Response.json({ result: extracted }, { headers: corsHeaders() })
}

function applyDeterministic(
  original: string,
  blocks: { search: string; replace: string }[]
): { ok: boolean; result: string } {
  let result = original
  for (const block of blocks) {
    if (!result.includes(block.search)) return { ok: false, result: '' }
    result = result.replace(block.search, block.replace)
  }
  return { ok: true, result }
}

function buildApplyPrompt(original: string, blocks: { search: string; replace: string }[]): string {
  const blockStr = blocks
    .map(b => `<<<SEARCH>>>\n${b.search}\n<<<REPLACE>>>\n${b.replace}\n<<<END>>>`)
    .join('\n\n')

  return `Apply the following search/replace blocks to the file. Return ONLY the complete modified file, no explanation.

ORIGINAL FILE:
\`\`\`
${original}
\`\`\`

CHANGES:
${blockStr}

MODIFIED FILE:`
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return match?.[1] ?? null
}

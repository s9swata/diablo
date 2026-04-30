import type { Env, EmbedRequest } from '../types'
import { corsHeaders, err } from '../types'

const MODEL = '@cf/baai/bge-base-en-v1.5'
const BATCH_SIZE = 100

export async function handleEmbed(req: Request, env: Env): Promise<Response> {
  const body = await req.json<EmbedRequest>().catch(() => null)
  if (!body?.texts?.length) return err('texts required')
  if (body.texts.length > 500) return err('max 500 texts per request')

  // CF BGE has a batch limit — process in chunks
  const embeddings: number[][] = []
  for (let i = 0; i < body.texts.length; i += BATCH_SIZE) {
    const batch = body.texts.slice(i, i + BATCH_SIZE)
    const response = await env.AI.run(MODEL, { text: batch } as any)
    const vecs = (response as any).data as number[][]
    embeddings.push(...vecs)
  }

  return Response.json({ embeddings }, { headers: corsHeaders() })
}

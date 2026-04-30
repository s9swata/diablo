import type { Env } from '../types'
import { corsHeaders, err } from '../types'
import { createKey, revokeKey, listKeys } from '../keys'

function isAdmin(req: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return false
  return req.headers.get('Authorization') === `Bearer ${env.ADMIN_KEY}`
}

export async function handleKeys(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return err('unauthorized', 401)

  if (req.method === 'GET') {
    const keys = await listKeys(env)
    return Response.json({ keys }, { headers: corsHeaders() })
  }

  if (req.method === 'POST') {
    const body = await req.json<{ name?: string }>().catch(() => ({ name: undefined }))
    const name = body?.name?.trim() || 'unnamed'
    const key = await createKey(env, name)
    return Response.json(key, { status: 201, headers: corsHeaders() })
  }

  if (req.method === 'DELETE') {
    const body = await req.json<{ token: string }>().catch(() => null)
    if (!body?.token) return err('token required')
    const ok = await revokeKey(env, body.token)
    if (!ok) return err('key not found', 404)
    return Response.json({ revoked: true }, { headers: corsHeaders() })
  }

  return err('method not allowed', 405)
}

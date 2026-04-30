import type { Env } from './types'
import { corsHeaders } from './types'
import { handleCompletions } from './routes/completions'
import { handleChat } from './routes/chat'
import { handleApply } from './routes/apply'
import { handleEmbed } from './routes/embed'
import { handleModels } from './routes/models'
import { handleUsageJson, handleDashboard } from './routes/usage'
import { handleKeys } from './routes/keys'
import { validateKey } from './keys'

async function checkUserAuth(req: Request, env: Env): Promise<Response | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) {
    return Response.json({ error: 'missing Authorization header' }, { status: 401, headers: corsHeaders() })
  }
  const valid = await validateKey(env, token)
  if (!valid) {
    return Response.json({ error: 'invalid api key' }, { status: 401, headers: corsHeaders() })
  }
  return null
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const { pathname } = new URL(request.url)

    // Public GET routes
    if (request.method === 'GET') {
      if (pathname === '/models') return handleModels()
      if (pathname === '/usage') return handleUsageJson(env)
      if (pathname === '/dashboard') return handleDashboard(env)
      if (pathname === '/') return handleDashboard(env)
      return new Response('Not found', { status: 404 })
    }

    // Admin key management (GET/POST/DELETE /keys)
    if (pathname === '/keys') return handleKeys(request, env)

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // All AI endpoints require a valid user key
    const authErr = await checkUserAuth(request, env)
    if (authErr) return authErr

    switch (pathname) {
      case '/completions': return handleCompletions(request, env)
      case '/chat':        return handleChat(request, env)
      case '/apply':       return handleApply(request, env)
      case '/embed':       return handleEmbed(request, env)
      default:             return new Response('Not found', { status: 404 })
    }
  },
}

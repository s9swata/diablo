import type { Env } from './types'

export async function logUsage(env: Env, endpoint: string, model: string): Promise<void> {
  if (!env.USAGE_KV) return
  const date = new Date().toISOString().slice(0, 10)
  const key = `usage:${date}:${endpoint}:${model}`
  const current = await env.USAGE_KV.get(key)
  await env.USAGE_KV.put(key, String((parseInt(current ?? '0', 10) + 1)), {
    expirationTtl: 60 * 60 * 24 * 35, // 35 days
  })
}

export interface UsageEntry {
  date: string
  endpoint: string
  model: string
  count: number
}

export async function getUsage(env: Env): Promise<UsageEntry[]> {
  if (!env.USAGE_KV) return []
  const list = await env.USAGE_KV.list({ prefix: 'usage:' })
  const entries: UsageEntry[] = []
  for (const key of list.keys) {
    const parts = key.name.split(':')
    // key format: usage:{date}:{endpoint}:{model_with_colons}
    // model IDs can contain slashes but not colons, so 4 parts total
    const [, date, endpoint, ...modelParts] = parts
    const model = modelParts.join(':')
    const val = await env.USAGE_KV.get(key.name)
    entries.push({ date, endpoint, model, count: parseInt(val ?? '0', 10) })
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

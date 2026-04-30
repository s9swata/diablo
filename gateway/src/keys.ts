import type { Env } from './types'

export interface KeyRecord {
  id: string
  name: string
  createdAt: string
  token?: string
}

function uuid(): string {
  return crypto.randomUUID()
}

// KV schema: key:{token} → KeyRecord JSON
const prefix = 'key:'

export async function createKey(env: Env, name: string): Promise<{ token: string } & KeyRecord> {
  const token = uuid()
  const record: KeyRecord = { id: token.slice(0, 8), name, createdAt: new Date().toISOString(), token }
  await env.USAGE_KV!.put(`${prefix}${token}`, JSON.stringify(record))
  return record as { token: string } & KeyRecord
}

export async function validateKey(env: Env, token: string): Promise<boolean> {
  if (!env.USAGE_KV) return false
  const val = await env.USAGE_KV.get(`${prefix}${token}`)
  return val !== null
}

export async function revokeKey(env: Env, token: string): Promise<boolean> {
  if (!env.USAGE_KV) return false
  const val = await env.USAGE_KV.get(`${prefix}${token}`)
  if (!val) return false
  await env.USAGE_KV.delete(`${prefix}${token}`)
  return true
}

export async function listKeys(env: Env): Promise<KeyRecord[]> {
  if (!env.USAGE_KV) return []
  const list = await env.USAGE_KV.list({ prefix })
  const records: KeyRecord[] = []
  for (const k of list.keys) {
    const val = await env.USAGE_KV.get(k.name)
    if (val) records.push(JSON.parse(val))
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

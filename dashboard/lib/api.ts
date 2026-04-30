// lib/api.ts

const BASE = process.env.NEXT_PUBLIC_GATEWAY_URL!

export interface ModelInfo {
  id: string
  name: string
  category: 'text-generation' | 'code' | 'embedding'
  description?: string
}

export interface UsageEntry {
  date: string
  endpoint: string
  model: string
  count: number
}

export interface KeyRecord {
  id: string
  name: string
  createdAt: string
  token?: string
}

export interface CreatedKey extends KeyRecord {
  token: string
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`, { cache: 'no-store' })
  const data = await res.json()
  return data.models
}

export async function fetchUsage(): Promise<UsageEntry[]> {
  const res = await fetch(`${BASE}/usage`, { cache: 'no-store' })
  const data = await res.json()
  return data.usage
}

// The three functions below take adminKey as a param.
// Call them only from Server Actions — never from client components.

export async function fetchKeys(adminKey: string): Promise<KeyRecord[]> {
  const res = await fetch(`${BASE}/keys`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return data.keys
}

export async function createKey(adminKey: string, name: string): Promise<CreatedKey> {
  const res = await fetch(`${BASE}/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export async function revokeKey(adminKey: string, token: string): Promise<void> {
  await fetch(`${BASE}/keys`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  })
}

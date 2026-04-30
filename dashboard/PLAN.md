# Diablo Dashboard — Build Plan

A Next.js web app for admins to manage API keys, browse available models, and track usage.
Talks exclusively to the deployed Cloudflare Workers gateway.

---

## Stack

| Thing | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Language | TypeScript |
| Data fetching | Native fetch (no extra libs) |
| Package manager | npm |

No database. No auth library. All data lives in the gateway's KV.

---

## Environment Variables

Create `dashboard/.env.local`:

```
NEXT_PUBLIC_GATEWAY_URL=https://your-gateway.workers.dev
ADMIN_KEY=your-admin-key-here
```

`NEXT_PUBLIC_GATEWAY_URL` is used client-side (browser fetches to /models, /usage).
`ADMIN_KEY` is used server-side only (Next.js Server Actions for /keys — never exposed to browser).

---

## File Structure

```
dashboard/
  app/
    layout.tsx
    page.tsx
    dashboard/
      page.tsx
    models/
      page.tsx
    keys/
      page.tsx
      actions.ts
  components/
    Nav.tsx
    UsageStats.tsx
    ModelList.tsx
    KeysTable.tsx
  lib/
    api.ts
  .env.local
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.ts
```

---

## Step 1 — Scaffold

Run from `diablo/` root:

```bash
npx create-next-app@14 dashboard --typescript --tailwind --app --no-src-dir --no-eslint --import-alias "@/*"
cd dashboard
```

---

## Step 2 — `lib/api.ts`

This file contains all gateway fetch helpers. Write it exactly as below.

```typescript
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
```

---

## Step 3 — `app/layout.tsx`

Root layout with nav. Replace the default layout entirely.

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'Diablo Dashboard' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <Nav />
        <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  )
}
```

---

## Step 4 — `components/Nav.tsx`

Top navigation bar with links to the three pages.

```typescript
// components/Nav.tsx
import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex gap-8 text-sm">
      <span className="font-bold text-white">Diablo</span>
      <Link href="/dashboard" className="text-gray-400 hover:text-white">Usage</Link>
      <Link href="/models" className="text-gray-400 hover:text-white">Models</Link>
      <Link href="/keys" className="text-gray-400 hover:text-white">API Keys</Link>
    </nav>
  )
}
```

---

## Step 5 — `app/page.tsx`

Root page redirects to /dashboard.

```typescript
// app/page.tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
```

---

## Step 6 — `app/dashboard/page.tsx`

Fetches `/usage` and shows:
- Total request count (big number at top)
- Table: requests by model (model name, count)
- Table: requests by endpoint (endpoint, count)
- Table: requests by day (date, count) — last 14 days

```typescript
// app/dashboard/page.tsx
import { fetchUsage, UsageEntry } from '@/lib/api'

function aggregate(entries: UsageEntry[], key: keyof UsageEntry): { label: string; count: number }[] {
  const map: Record<string, number> = {}
  for (const e of entries) {
    const k = String(e[key])
    map[k] = (map[k] ?? 0) + e.count
  }
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

function StatTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-medium text-gray-400 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-gray-600 text-sm">No data yet</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-t border-gray-800">
                <td className="py-2 text-gray-300">{r.label}</td>
                <td className="py-2 text-right font-mono text-white">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default async function DashboardPage() {
  const entries = await fetchUsage()
  const total = entries.reduce((s, e) => s + e.count, 0)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Usage</h1>

      <div className="bg-gray-900 rounded-lg p-5 mb-6 inline-block">
        <div className="text-gray-400 text-sm">Total requests</div>
        <div className="text-4xl font-bold text-white mt-1">{total.toLocaleString()}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTable title="By model" rows={aggregate(entries, 'model')} />
        <StatTable title="By endpoint" rows={aggregate(entries, 'endpoint')} />
        <StatTable title="By day" rows={aggregate(entries, 'date')} />
      </div>
    </div>
  )
}
```

---

## Step 7 — `app/models/page.tsx`

Fetches `/models` and renders model cards grouped by category.

Category groups to render in this order: `text-generation`, `code`, `embedding`.
Category display names: `text-generation` → "Text Generation", `code` → "Code", `embedding` → "Embeddings".

```typescript
// app/models/page.tsx
import { fetchModels, ModelInfo } from '@/lib/api'

const CATEGORY_LABELS: Record<string, string> = {
  'text-generation': 'Text Generation',
  'code': 'Code',
  'embedding': 'Embeddings',
}

function ModelCard({ model }: { model: ModelInfo }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="font-medium text-white">{model.name}</div>
      <div className="font-mono text-xs text-gray-500 mt-1">{model.id}</div>
      {model.description && (
        <div className="text-sm text-gray-400 mt-2">{model.description}</div>
      )}
    </div>
  )
}

export default async function ModelsPage() {
  const models = await fetchModels()
  const categories = ['text-generation', 'code', 'embedding']

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Models</h1>
      {categories.map(cat => {
        const group = models.filter(m => m.category === cat)
        if (group.length === 0) return null
        return (
          <section key={cat} className="mb-8">
            <h2 className="text-sm font-medium text-gray-400 mb-3">
              {CATEGORY_LABELS[cat] ?? cat}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.map(m => <ModelCard key={m.id} model={m} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

---

## Step 8 — `app/keys/actions.ts`

Server Actions for key management. The `ADMIN_KEY` env var is read here — it never touches the browser.

```typescript
// app/keys/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createKey, revokeKey } from '@/lib/api'

const ADMIN_KEY = process.env.ADMIN_KEY!

export async function actionCreateKey(formData: FormData) {
  const name = (formData.get('name') as string)?.trim() || 'unnamed'
  const key = await createKey(ADMIN_KEY, name)
  revalidatePath('/keys')
  return key  // returned to client so we can show the token once
}

export async function actionRevokeKey(formData: FormData) {
  const token = formData.get('token') as string
  await revokeKey(ADMIN_KEY, token)
  revalidatePath('/keys')
}
```

---

## Step 9 — `app/keys/page.tsx`

Shows existing keys in a table. Has a form to create a new key (name input + button).
After creating, shows the token in an alert box — only time it's visible.
Each row has a Revoke button.

This page is a Server Component that renders a Client Component for interactive parts.

Write two components in this file:
1. `KeysPage` (default export, server component) — fetches keys, passes to `KeysClient`
2. `KeysClient` (client component, `'use client'`) — handles form state and shows new token

```typescript
// app/keys/page.tsx
import { fetchKeys, KeyRecord } from '@/lib/api'
import { actionCreateKey, actionRevokeKey } from './actions'
import KeysClient from './KeysClient'

export default async function KeysPage() {
  const adminKey = process.env.ADMIN_KEY!
  const keys = await fetchKeys(adminKey)
  return <KeysClient keys={keys} createKey={actionCreateKey} revokeKey={actionRevokeKey} />
}
```

---

## Step 10 — `app/keys/KeysClient.tsx`

Client component with the interactive UI.

```typescript
// app/keys/KeysClient.tsx
'use client'

import { useState } from 'react'
import { KeyRecord, CreatedKey } from '@/lib/api'

interface Props {
  keys: KeyRecord[]
  createKey: (formData: FormData) => Promise<CreatedKey>
  revokeKey: (formData: FormData) => Promise<void>
}

export default function KeysClient({ keys, createKey, revokeKey }: Props) {
  const [newToken, setNewToken] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleCreate(formData: FormData) {
    setCreating(true)
    const key = await createKey(formData)
    setNewToken(key.token)
    setCreating(false)
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">API Keys</h1>

      {newToken && (
        <div className="bg-green-900 border border-green-700 rounded-lg p-4 mb-6">
          <div className="text-sm text-green-300 mb-1">Key created — copy it now, it won't be shown again:</div>
          <div className="font-mono text-green-100 break-all">{newToken}</div>
          <button
            className="mt-2 text-xs text-green-400 underline"
            onClick={() => setNewToken(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form action={handleCreate} className="flex gap-3 mb-8">
        <input
          name="name"
          placeholder="Key name (e.g. alice)"
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
        />
        <button
          type="submit"
          disabled={creating}
          className="bg-white text-black px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Key'}
        </button>
      </form>

      {keys.length === 0 ? (
        <p className="text-gray-600 text-sm">No keys yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="pb-2 font-normal">Name</th>
              <th className="pb-2 font-normal">ID</th>
              <th className="pb-2 font-normal">Created</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id} className="border-b border-gray-800">
                <td className="py-3 text-white">{k.name}</td>
                <td className="py-3 font-mono text-gray-400">{k.id}</td>
                <td className="py-3 text-gray-400">{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="py-3 text-right">
                  <form action={revokeKey}>
                    <input type="hidden" name="token" value={k.id} />
                    <button
                      type="submit"
                      className="text-red-500 hover:text-red-400 text-xs"
                    >
                      Revoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

**Important:** The revoke action sends `k.id` (the short 8-char prefix), not the full token — because the user was never shown the full token for existing keys. Update `gateway/src/keys.ts` → `revokeKey` to also support lookup by short `id` field, OR store the full token in the `KeyRecord` and use that. Whichever you choose, keep it consistent.

---

## Step 11 — `package.json`

Run from `dashboard/`:

```bash
npm install
npm run dev
```

No extra packages needed beyond what create-next-app installs.

---

## Step 12 — Verify Each Page

| Page | URL | What to check |
|------|-----|---------------|
| Usage | `/dashboard` | Shows total count and three tables |
| Models | `/models` | All 16 models grouped by category |
| Keys | `/keys` | Can create a key, token shown once, revoke removes row |

---

## Known Gap to Fix Before Building

The `revokeKey` gateway endpoint currently expects the full UUID token in the body.
The keys list response only returns the short `id` (first 8 chars of the token).
The full token is only shown at creation time.

**Fix option (simplest):** In `gateway/src/keys.ts`, change the KV key from `key:{token}` to also index by `key:id:{shortId}` pointing to the full token, so revoke can work with either.

OR: store `token` in the `KeyRecord` JSON in KV and return it in list responses (simpler — just a string in the JSON).

Pick one before building the dashboard. The second option (store token in record, return it in list) is simpler and requires one line change in `gateway/src/keys.ts`.

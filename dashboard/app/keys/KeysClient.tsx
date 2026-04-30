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
                    <input type="hidden" name="token" value={k.token || k.id} />
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
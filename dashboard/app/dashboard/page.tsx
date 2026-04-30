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
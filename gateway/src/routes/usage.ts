import type { Env } from '../types'
import { corsHeaders } from '../types'
import { getUsage } from '../usage'

export async function handleUsageJson(env: Env): Promise<Response> {
  const entries = await getUsage(env)
  return Response.json({ usage: entries }, { headers: corsHeaders() })
}

export async function handleDashboard(env: Env): Promise<Response> {
  const entries = await getUsage(env)

  // Aggregate by model
  const byModel: Record<string, number> = {}
  const byEndpoint: Record<string, number> = {}
  const byDay: Record<string, number> = {}
  let total = 0

  for (const e of entries) {
    byModel[e.model] = (byModel[e.model] ?? 0) + e.count
    byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] ?? 0) + e.count
    byDay[e.date] = (byDay[e.date] ?? 0) + e.count
    total += e.count
  }

  const rows = (obj: Record<string, number>) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diablo Gateway — Usage</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  p.sub { color: #666; margin-top: 0; font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin: 32px 0; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
  .card h2 { font-size: 1rem; margin: 0 0 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  th { color: #888; font-weight: 500; }
  .total { font-size: 2rem; font-weight: 700; }
  .label { color: #888; font-size: .8rem; }
  a { color: #2563eb; text-decoration: none; }
</style>
</head>
<body>
<h1>Diablo Gateway — Usage Dashboard</h1>
<p class="sub">Last 30 days · <a href="/usage">JSON</a> · <a href="/models">Models</a></p>

<div class="grid">
  <div class="card">
    <div class="label">Total requests</div>
    <div class="total">${total.toLocaleString()}</div>
  </div>

  <div class="card">
    <h2>By Model</h2>
    <table>
      <tr><th>Model</th><th>Requests</th></tr>
      ${rows(byModel) || '<tr><td colspan="2">No data</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>By Endpoint</h2>
    <table>
      <tr><th>Endpoint</th><th>Requests</th></tr>
      ${rows(byEndpoint) || '<tr><td colspan="2">No data</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>By Day</h2>
    <table>
      <tr><th>Date</th><th>Requests</th></tr>
      ${rows(byDay) || '<tr><td colspan="2">No data</td></tr>'}
    </table>
  </div>
</div>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

# Gateway Feature Plan

## What we're adding

1. **Model list** — `GET /models` returns all available CF Workers AI models with categories
2. **Model selection** — `/chat` and `/completions` accept optional `model` param to switch models
3. **Usage tracking** — every AI call logs to KV (endpoint + model + day → count)
4. **Usage API** — `GET /usage` returns JSON stats
5. **Dashboard** — `GET /dashboard` serves inline HTML to view usage by model/endpoint
6. **API key auth** — optional `API_KEY` env var; if set, all POST endpoints require `Authorization: Bearer <key>`

## Files changed

| File | Change |
|------|--------|
| `wrangler.toml` | Add KV namespace `USAGE_KV` |
| `src/types.ts` | Add `USAGE_KV`, `API_KEY` to Env; add `model?` to request types |
| `src/models.ts` | NEW — hardcoded CF model catalog with categories |
| `src/routes/models.ts` | NEW — `GET /models` handler |
| `src/routes/usage.ts` | NEW — `GET /usage` (JSON) + `GET /dashboard` (HTML) |
| `src/routes/chat.ts` | Accept optional `model` param |
| `src/routes/completions.ts` | Accept optional `model` param |
| `src/index.ts` | Add GET routing, new routes, auth middleware |

## Model catalog (text generation only — for model switching)

All `@cf/` prefixed IDs. Chat endpoint defaults to `@cf/moonshotai/kimi-k2.6`, completions to `@cf/qwen/qwen2.5-coder-32b-instruct`.

## Usage KV schema

Key: `usage:{YYYY-MM-DD}:{endpoint}:{model}` → value: count as string  
`GET /usage` aggregates last 30 days.

## Non-goals

- No key issuance UI (use env var)
- No per-key usage tracking (global only)
- No streaming model switch validation
- No text-to-image / speech models (chat/completion only for switching)

import { corsHeaders } from '../types'
import { MODELS } from '../models'

export function handleModels(): Response {
  return Response.json({ models: MODELS }, { headers: corsHeaders() })
}

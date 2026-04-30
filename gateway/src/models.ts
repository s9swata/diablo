export interface ModelInfo {
  id: string
  name: string
  category: 'text-generation' | 'code' | 'embedding'
  description?: string
}

export const MODELS: ModelInfo[] = [
  // Text generation
  { id: '@cf/moonshotai/kimi-k2.6', name: 'Kimi K2.6', category: 'text-generation', description: 'Moonshot AI flagship chat model' },
  { id: '@cf/moonshotai/kimi-k2.5', name: 'Kimi K2.5', category: 'text-generation', description: 'Moonshot AI previous generation' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (fast)', category: 'text-generation', description: 'Meta Llama 3.3 70B FP8 quantized' },
  { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', category: 'text-generation', description: 'Meta Llama 3.1 8B instruction-tuned' },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', category: 'text-generation', description: 'Meta Llama 3.2 3B lightweight' },
  { id: '@cf/meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B', category: 'text-generation', description: 'Meta Llama 3.2 1B ultra-lightweight' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B', category: 'text-generation', description: 'Google Gemma 3 instruction-tuned' },
  { id: '@cf/mistral/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1 24B', category: 'text-generation', description: 'Mistral Small instruction-tuned' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 32B', category: 'text-generation', description: 'DeepSeek R1 distilled reasoning model' },
  { id: '@cf/qwen/qwq-32b', name: 'QwQ 32B', category: 'text-generation', description: 'Qwen reasoning model' },

  // Code
  { id: '@cf/qwen/qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', category: 'code', description: 'Best-in-class code completion and generation' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', name: 'Qwen3 30B', category: 'code', description: 'Qwen3 MoE model, strong at code' },

  // Embeddings
  { id: '@cf/baai/bge-base-en-v1.5', name: 'BGE Base EN', category: 'embedding', description: 'BAAI BGE base English embeddings' },
  { id: '@cf/baai/bge-large-en-v1.5', name: 'BGE Large EN', category: 'embedding', description: 'BAAI BGE large English embeddings' },
  { id: '@cf/baai/bge-small-en-v1.5', name: 'BGE Small EN', category: 'embedding', description: 'BAAI BGE small English embeddings' },
  { id: '@cf/baai/bge-m3', name: 'BGE M3', category: 'embedding', description: 'BAAI BGE multilingual embeddings' },
]

export const CHAT_MODELS = MODELS.filter(m => m.category === 'text-generation' || m.category === 'code')
export const COMPLETION_MODELS = MODELS.filter(m => m.category === 'code' || m.category === 'text-generation')
export const EMBEDDING_MODELS = MODELS.filter(m => m.category === 'embedding')

export const DEFAULT_CHAT_MODEL = '@cf/moonshotai/kimi-k2.6'
export const DEFAULT_COMPLETION_MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct'
export const DEFAULT_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'

export function isValidModel(id: string): boolean {
  return MODELS.some(m => m.id === id)
}

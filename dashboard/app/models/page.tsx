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
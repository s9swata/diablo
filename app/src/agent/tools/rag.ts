import { invoke } from "@tauri-apps/api/core";

export interface ChunkResult {
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  lang: string;
}

export async function ragSearch({
  query,
  k = 8,
  root,
}: {
  query: string;
  k?: number;
  root: string;
}): Promise<string> {
  const results: ChunkResult[] = await invoke("index_search", { query, k, root });
  if (results.length === 0) return "";
  return results
    .map((r) => `// ${r.path}:${r.start_line}-${r.end_line}\n${r.content}`)
    .join("\n\n---\n\n");
}
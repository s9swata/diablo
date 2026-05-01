export interface SearchReplaceBlock {
  search: string;
  replace: string;
}

export function parseSearchReplace(text: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const pattern = /<<<SEARCH>>>\n([\s\S]*?)<<<REPLACE>>>\n([\s\S]*?)<<<END>>>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    blocks.push({ search: m[1], replace: m[2] });
  }
  return blocks;
}

export function applySearchReplace(original: string, block: SearchReplaceBlock): string | null {
  if (!original.includes(block.search)) return null;
  return original.replace(block.search, block.replace);
}

export function applyAllBlocks(original: string, blocks: SearchReplaceBlock[]): string | null {
  let result = original;
  for (const block of blocks) {
    const next = applySearchReplace(result, block);
    if (next === null) return null;
    result = next;
  }
  return result;
}

import { autocompletion, CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { Extension } from "@codemirror/state";
import { lspClient } from "../lspClient";

interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { value: string };
  insertText?: string;
  filterText?: string;
}

interface LspCompletionList {
  items: LspCompletionItem[];
  isIncomplete?: boolean;
}

// LSP completion kind → CodeMirror type string
const KIND_MAP: Record<number, string> = {
  1: "text", 2: "method", 3: "function", 4: "constructor",
  5: "variable", 6: "class", 7: "interface", 8: "module",
  9: "property", 10: "unit", 11: "value", 12: "enum",
  13: "keyword", 14: "snippet", 15: "color", 16: "file",
  17: "reference", 18: "folder", 19: "enum", 20: "constant",
  21: "class", 22: "type", 23: "keyword", 24: "keyword", 25: "operator",
};

export function lspCompletionsExtension(
  getLspId: () => string,
  getFilePath: () => string,
): Extension {
  async function source(ctx: CompletionContext): Promise<CompletionResult | null> {
    const lang = getLspId();
    const filePath = getFilePath();
    const serverId = await lspClient.ensureStarted(lang, filePath);
    if (!serverId) return null;

    const uri = `file://${filePath}`;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const character = ctx.pos - line.from;

    const controller = new AbortController();
    let result: LspCompletionItem[] | LspCompletionList | null = null;
    try {
      result = (await lspClient.request(
        serverId,
        "textDocument/completion",
        { textDocument: { uri }, position: { line: line.number - 1, character } },
        controller.signal,
      )) as LspCompletionItem[] | LspCompletionList | null;
    } catch { return null; }

    if (!result) return null;
    const items: LspCompletionItem[] = Array.isArray(result) ? result : (result.items ?? []);

    const word = ctx.matchBefore(/\w*/);
    const from = word?.from ?? ctx.pos;

    const options: Completion[] = items.slice(0, 200).map((item) => ({
      label: item.label,
      type: item.kind ? (KIND_MAP[item.kind] ?? "text") : "text",
      detail: item.detail,
      info: item.documentation
        ? (typeof item.documentation === "string" ? item.documentation : item.documentation.value)
        : undefined,
      apply: item.insertText ?? item.label,
    }));

    return { from, options, validFor: /^\w*$/ };
  }

  return autocompletion({ override: [source], closeOnBlur: true });
}

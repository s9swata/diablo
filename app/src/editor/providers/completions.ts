import type * as Monaco from "monaco-editor";
import { lspClient, monacoLangToLsp } from "../lspClient";

interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { value: string };
  insertText?: string;
}

interface LspCompletionList {
  items: LspCompletionItem[];
}

export function registerCompletionProvider(monaco: typeof Monaco) {
  monaco.languages.registerCompletionItemProvider("*", {
    triggerCharacters: [".", ":", "(", "[", " ", "<"],
    async provideCompletionItems(model, position, _context, token) {
      const lang = monacoLangToLsp(model.getLanguageId());
      console.debug("[completion] trigger lang=%s pos=%d:%d uri=%s", lang, position.lineNumber, position.column, model.uri.path);
      const serverId = await lspClient.ensureStarted(lang);
      if (!serverId) {
        console.debug("[completion] no server for", lang);
        return { suggestions: [] };
      }

      const uri = `file://${model.uri.path}`;
      await lspClient.ensureFileOpen(serverId, uri, lang, model.getValue());

      let result: LspCompletionItem[] | LspCompletionList | null = null;
      try {
        result = (await lspClient.request(serverId, "textDocument/completion", {
          textDocument: { uri: `file://${model.uri.path}` },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }, token)) as LspCompletionItem[] | LspCompletionList | null;
        console.debug("[completion] result", result);
      } catch (e) {
        console.error("[completion] request failed", e);
        return { suggestions: [] };
      }

      if (!result) { console.debug("[completion] null result"); return { suggestions: [] }; }
      const items: LspCompletionItem[] = Array.isArray(result)
        ? result
        : result.items ?? [];

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };

      console.debug("[completion] returning", items.length, "items");
      return {
        suggestions: items.slice(0, 100).map((item) => ({
          label: item.label,
          kind: item.kind != null
            ? (item.kind - 1) as Monaco.languages.CompletionItemKind
            : monaco.languages.CompletionItemKind.Text,
          detail: item.detail,
          documentation: item.documentation
            ? {
                value: typeof item.documentation === "string"
                  ? item.documentation
                  : item.documentation.value,
                isTrusted: true,
              }
            : undefined,
          insertText: item.insertText ?? item.label,
          range,
        })),
      };
    },
  });
}

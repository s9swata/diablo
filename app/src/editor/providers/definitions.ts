import type * as Monaco from "monaco-editor";
import { lspClient, monacoLangToLsp } from "../lspClient";

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

function lspRangeToMonaco(r: LspRange): Monaco.IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
  };
}

export function registerDefinitionProvider(monaco: typeof Monaco) {
  monaco.languages.registerDefinitionProvider("*", {
    async provideDefinition(model, position, token) {
      const lang = monacoLangToLsp(model.getLanguageId());
      const serverId = await lspClient.ensureStarted(lang);
      if (!serverId) return null;

      const uri = `file://${model.uri.path}`;
      await lspClient.ensureFileOpen(serverId, uri, lang, model.getValue());

      let result: LspLocation | LspLocation[] | null = null;
      try {
        result = (await lspClient.request(serverId, "textDocument/definition", {
          textDocument: { uri },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }, token)) as LspLocation | LspLocation[] | null;
      } catch {
        return null;
      }

      if (!result) return null;
      const locs = Array.isArray(result) ? result : [result];
      return locs.map((loc) => ({
        uri: monaco.Uri.parse(loc.uri),
        range: lspRangeToMonaco(loc.range),
      }));
    },
  });
}

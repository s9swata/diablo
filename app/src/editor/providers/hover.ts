import type * as Monaco from "monaco-editor";
import { lspClient, monacoLangToLsp } from "../lspClient";

interface LspHoverContents {
  kind?: string;
  value?: string;
}

interface LspHoverResult {
  contents?: string | LspHoverContents | (string | LspHoverContents)[];
}

export function registerHoverProvider(monaco: typeof Monaco) {
  monaco.languages.registerHoverProvider("*", {
    async provideHover(model, position, token) {
      const lang = monacoLangToLsp(model.getLanguageId());
      const serverId = await lspClient.ensureStarted(lang);
      if (!serverId) return null;

      const uri = `file://${model.uri.path}`;
      await lspClient.ensureFileOpen(serverId, uri, lang, model.getValue());

      let result: LspHoverResult | null = null;
      try {
        result = (await lspClient.request(serverId, "textDocument/hover", {
          textDocument: { uri },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }, token)) as LspHoverResult | null;
      } catch {
        return null;
      }

      if (!result?.contents) return null;
      const raw = Array.isArray(result.contents) ? result.contents : [result.contents];
      const contents = raw.map((c) => ({
        value: typeof c === "string" ? c : (c.value ?? ""),
        isTrusted: true,
      })).filter((c) => c.value);

      return contents.length ? { contents } : null;
    },
  });
}

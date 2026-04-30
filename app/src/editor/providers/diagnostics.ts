import type * as Monaco from "monaco-editor";
import { lspClient } from "../lspClient";
import { useEditorStore } from "../../store/editor";

interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
}

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

function lspSeverityToMonaco(monaco: typeof Monaco, severity?: number): Monaco.MarkerSeverity {
  switch (severity) {
    case 1: return monaco.MarkerSeverity.Error;
    case 2: return monaco.MarkerSeverity.Warning;
    case 3: return monaco.MarkerSeverity.Info;
    case 4: return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Error;
  }
}

export function registerDiagnosticsHandler(monaco: typeof Monaco) {
  lspClient.onNotification("textDocument/publishDiagnostics", (params) => {
    const { uri, diagnostics } = params as PublishDiagnosticsParams;
    // Models are created with path-only URIs by @monaco-editor/react.
    // Match by path: "file:///foo/bar.ts" → path "/foo/bar.ts"
    const uriPath = uri.startsWith("file://") ? uri.slice(7) : uri;
    const model = monaco.editor.getModels().find((m) => m.uri.path === uriPath) ?? null;
    if (model) {
      monaco.editor.setModelMarkers(
        model,
        "lsp",
        diagnostics.map((d) => ({
          severity: lspSeverityToMonaco(monaco, d.severity),
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          message: d.message,
          source: d.source,
        })),
      );
    }
    useEditorStore.getState().setDiagnostics(uri, diagnostics);
  });
}

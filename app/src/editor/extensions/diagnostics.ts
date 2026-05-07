import { EditorView } from "@codemirror/view";
import { setDiagnostics, lintGutter, Diagnostic } from "@codemirror/lint";
import { Extension } from "@codemirror/state";
import { lspClient } from "../lspClient";
import { useEditorStore } from "../../store/editor";

interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
}

function lspSeverity(s?: number): "error" | "warning" | "info" {
  if (s === 1) return "error";
  if (s === 2) return "warning";
  return "info";
}

function lspDiagsToCm(view: EditorView, diags: LspDiagnostic[]): Diagnostic[] {
  const doc = view.state.doc;
  return diags.flatMap((d) => {
    try {
      const from = doc.line(d.range.start.line + 1).from + d.range.start.character;
      const to   = doc.line(d.range.end.line + 1).from + d.range.end.character;
      return [{ from, to, severity: lspSeverity(d.severity), message: d.message, source: d.source }];
    } catch { return []; }
  });
}

// Per-view registry so the push handler can find the right view
const viewRegistry = new Map<string, EditorView>();

export const registerDiagnosticsView = (uri: string, view: EditorView) => viewRegistry.set(uri, view);
export const unregisterDiagnosticsView = (uri: string) => viewRegistry.delete(uri);

// Single global push handler registered once
let pushHandlerRegistered = false;
export function applyDiagnosticsToView(view: EditorView, uri: string, diags: LspDiagnostic[]) {
  const cmDiags = lspDiagsToCm(view, diags);
  view.dispatch(setDiagnostics(view.state, cmDiags));
  useEditorStore.getState().setDiagnostics(uri, diags);
}

export function registerPushDiagnosticsHandler() {
  if (pushHandlerRegistered) return;
  pushHandlerRegistered = true;
  lspClient.onNotification("textDocument/publishDiagnostics", (params) => {
    const { uri, diagnostics } = params as { uri: string; diagnostics: LspDiagnostic[] };
    const view = viewRegistry.get(uri);
    if (view) applyDiagnosticsToView(view, uri, diagnostics);
  });
}

// Pull diagnostics — called after each didChange
const pullResultIds = new Map<string, string>();

export async function pullDiagnostics(view: EditorView, serverId: string, uri: string) {
  try {
    const result = await lspClient.request(serverId, "textDocument/diagnostic", {
      textDocument: { uri },
      previousResultId: pullResultIds.get(uri),
    }) as { kind: string; resultId?: string; items?: LspDiagnostic[] } | null;

    if (!result || result.kind === "unchanged") return;
    if (result.resultId) pullResultIds.set(uri, result.resultId);
    applyDiagnosticsToView(view, uri, result.items ?? []);
  } catch { /* server doesn't support pull — push handler covers it */ }
}

export function diagnosticsExtension(): Extension {
  return lintGutter();
}

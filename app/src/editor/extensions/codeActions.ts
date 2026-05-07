import { EditorView, keymap, Tooltip, showTooltip } from "@codemirror/view";
import { Extension, StateEffect, StateField } from "@codemirror/state";
import { lspClient } from "../lspClient";

interface LspPosition { line: number; character: number; }
interface LspTextEdit { range: { start: LspPosition; end: LspPosition }; newText: string; }
interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: { textDocument: { uri: string }; edits: LspTextEdit[] }[];
}
interface LspCodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  edit?: LspWorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
}

function applyWorkspaceEdit(view: EditorView, edit: LspWorkspaceEdit, currentUri: string) {
  const allEdits: LspTextEdit[] = [];

  if (edit.changes?.[currentUri]) allEdits.push(...edit.changes[currentUri]);
  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      if (dc.textDocument.uri === currentUri) allEdits.push(...dc.edits);
    }
  }

  if (!allEdits.length) return;
  const doc = view.state.doc;
  const changes = allEdits.map((te) => {
    const from = doc.line(te.range.start.line + 1).from + te.range.start.character;
    const to   = doc.line(te.range.end.line + 1).from + te.range.end.character;
    return { from, to, insert: te.newText };
  });
  view.dispatch({ changes });
}

const setActionsTooltip = StateEffect.define<Tooltip | null>();

const actionsTooltipField = StateField.define<readonly Tooltip[]>({
  create() { return []; },
  update(tooltips, tr) {
    for (const e of tr.effects) {
      if (e.is(setActionsTooltip)) return e.value ? [e.value] : [];
    }
    if (tr.docChanged || tr.selection) return [];
    return tooltips;
  },
  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});

async function showCodeActions(
  view: EditorView,
  getLspId: () => string,
  getFilePath: () => string,
): Promise<boolean> {
  const lang = getLspId();
  const filePath = getFilePath();
  const serverId = await lspClient.ensureStarted(lang, filePath);
  if (!serverId) return false;

  const uri = `file://${filePath}`;
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);

  let result: LspCodeAction[] | null = null;
  try {
    result = (await lspClient.request(serverId, "textDocument/codeAction", {
      textDocument: { uri },
      range: {
        start: { line: line.number - 1, character: pos - line.from },
        end:   { line: line.number - 1, character: pos - line.from },
      },
      context: { diagnostics: [] },
    })) as LspCodeAction[] | null;
  } catch { return false; }

  if (!result?.length) return false;

  const tooltip: Tooltip = {
    pos,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-code-actions";
      dom.style.cssText = "background:var(--color-bg-sidebar,#1e1e1e);border:1px solid var(--color-border-subtle,#333);border-radius:4px;padding:2px 0;min-width:180px;";

      for (const action of result!) {
        const btn = document.createElement("div");
        btn.textContent = action.title;
        btn.style.cssText = "padding:5px 12px;cursor:pointer;font-size:13px;white-space:nowrap;";
        btn.onmouseenter = () => { btn.style.background = "var(--color-hover,rgba(255,255,255,0.08))"; };
        btn.onmouseleave = () => { btn.style.background = ""; };
        btn.onclick = () => {
          view.dispatch({ effects: setActionsTooltip.of(null) });
          if (action.edit) applyWorkspaceEdit(view, action.edit, uri);
        };
        dom.appendChild(btn);
      }
      return { dom };
    },
  };

  view.dispatch({ effects: setActionsTooltip.of(tooltip) });
  return true;
}

export function lspCodeActionsExtension(
  getLspId: () => string,
  getFilePath: () => string,
): Extension {
  return [
    actionsTooltipField,
    keymap.of([{
      key: "Mod-.",
      run: (view) => { showCodeActions(view, getLspId, getFilePath).catch(() => {}); return true; },
    }]),
  ];
}

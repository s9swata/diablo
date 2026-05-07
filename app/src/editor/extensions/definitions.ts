import { keymap, EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { invoke } from "@tauri-apps/api/core";
import { lspClient } from "../lspClient";
import { useEditorStore } from "../../store/editor";

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
interface LspLocation { uri: string; range: LspRange; }

async function goToDefinition(
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

  let result: LspLocation | LspLocation[] | null = null;
  try {
    result = (await lspClient.request(serverId, "textDocument/definition", {
      textDocument: { uri },
      position: { line: line.number - 1, character: pos - line.from },
    })) as LspLocation | LspLocation[] | null;
  } catch { return false; }

  if (!result) return false;
  const locs = Array.isArray(result) ? result : [result];
  if (!locs.length) return false;

  const target = locs[0];
  const targetPath = target.uri.startsWith("file://") ? target.uri.slice(7) : target.uri;

  if (targetPath === filePath) {
    // Same file — scroll and move cursor
    const targetLine = view.state.doc.line(target.range.start.line + 1);
    const targetPos = targetLine.from + target.range.start.character;
    view.dispatch({
      selection: { anchor: targetPos },
      effects: EditorView.scrollIntoView(targetPos, { y: "center" }),
    });
  } else {
    // Different file — read and open it
    try {
      const content = await invoke<string>("fs_read", { path: targetPath });
      useEditorStore.getState().openFile(targetPath, content);
      // After switching, dispatch a goto event so CodeMirrorEditor can scroll
      window.dispatchEvent(new CustomEvent("editor-goto", {
        detail: { line: target.range.start.line + 1, col: target.range.start.character + 1 },
      }));
    } catch { return false; }
  }

  return true;
}

export function lspDefinitionsExtension(
  getLspId: () => string,
  getFilePath: () => string,
): Extension {
  return keymap.of([{
    key: "F12",
    run: (view) => { goToDefinition(view, getLspId, getFilePath).catch(() => {}); return true; },
  }]);
}

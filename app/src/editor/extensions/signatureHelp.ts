import { EditorView, Tooltip, showTooltip, keymap } from "@codemirror/view";
import { Extension, StateEffect, StateField } from "@codemirror/state";
import { lspClient } from "../lspClient";

interface LspSignatureHelp {
  signatures: { label: string; documentation?: string | { value: string }; parameters?: { label: string | [number, number] }[]; activeParameter?: number }[];
  activeSignature?: number;
  activeParameter?: number;
}

const setSignatureTooltip = StateEffect.define<Tooltip | null>();

const signatureTooltipField = StateField.define<readonly Tooltip[]>({
  create() { return []; },
  update(tooltips, tr) {
    for (const e of tr.effects) {
      if (e.is(setSignatureTooltip)) return e.value ? [e.value] : [];
    }
    if (tr.docChanged) return [];
    return tooltips;
  },
  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});

function buildTooltipDom(help: LspSignatureHelp): HTMLElement {
  const dom = document.createElement("div");
  dom.style.cssText = "padding:5px 10px;font-size:13px;max-width:500px;";

  const sig = help.signatures[help.activeSignature ?? 0];
  if (!sig) return dom;

  const activeParam = sig.activeParameter ?? help.activeParameter ?? 0;
  const params = sig.parameters ?? [];

  if (!params.length) {
    dom.textContent = sig.label;
    return dom;
  }

  const code = document.createElement("code");
  let label = sig.label;

  // Highlight the active parameter
  const param = params[activeParam];
  if (param) {
    if (Array.isArray(param.label)) {
      const [start, end] = param.label as [number, number];
      code.appendChild(document.createTextNode(label.slice(0, start)));
      const mark = document.createElement("strong");
      mark.style.color = "#dcdcaa";
      mark.textContent = label.slice(start, end);
      code.appendChild(mark);
      code.appendChild(document.createTextNode(label.slice(end)));
    } else {
      const idx = label.indexOf(param.label as string);
      if (idx >= 0) {
        code.appendChild(document.createTextNode(label.slice(0, idx)));
        const mark = document.createElement("strong");
        mark.style.color = "#dcdcaa";
        mark.textContent = param.label as string;
        code.appendChild(mark);
        code.appendChild(document.createTextNode(label.slice(idx + (param.label as string).length)));
      } else {
        code.textContent = label;
      }
    }
  } else {
    code.textContent = label;
  }
  dom.appendChild(code);
  return dom;
}

async function fetchSignatureHelp(
  view: EditorView,
  getLspId: () => string,
  getFilePath: () => string,
) {
  const lang = getLspId();
  const filePath = getFilePath();
  const serverId = await lspClient.ensureStarted(lang, filePath);
  if (!serverId) return;

  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);

  let result: LspSignatureHelp | null = null;
  try {
    result = (await lspClient.request(serverId, "textDocument/signatureHelp", {
      textDocument: { uri: `file://${filePath}` },
      position: { line: line.number - 1, character: pos - line.from },
    })) as LspSignatureHelp | null;
  } catch { return; }

  if (!result?.signatures?.length) {
    view.dispatch({ effects: setSignatureTooltip.of(null) });
    return;
  }

  const tooltip: Tooltip = {
    pos,
    above: true,
    create() { return { dom: buildTooltipDom(result!) }; },
  };
  view.dispatch({ effects: setSignatureTooltip.of(tooltip) });
}

export function lspSignatureHelpExtension(
  getLspId: () => string,
  getFilePath: () => string,
): Extension {
  return [
    signatureTooltipField,
    keymap.of([
      {
        key: "(",
        run(view) {
          // Let the character through, then fetch
          setTimeout(() => fetchSignatureHelp(view, getLspId, getFilePath), 0);
          return false; // don't consume — let "(" be inserted normally
        },
      },
      {
        key: "Escape",
        run(view) {
          view.dispatch({ effects: setSignatureTooltip.of(null) });
          return false;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const pos = update.state.selection.main.head;
        const char = update.state.doc.sliceString(pos - 1, pos);
        if (char === "," ) {
          fetchSignatureHelp(update.view, getLspId, getFilePath);
        }
      }
    }),
  ];
}

import { hoverTooltip } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { lspClient } from "../lspClient";

interface LspHoverContents {
  kind?: string;
  value?: string;
}

interface LspHoverResult {
  contents?: string | LspHoverContents | (string | LspHoverContents)[];
}

function extractMarkdown(contents: LspHoverResult["contents"]): string {
  if (!contents) return "";
  const raw = Array.isArray(contents) ? contents : [contents];
  return raw
    .map((c) => (typeof c === "string" ? c : (c.value ?? "")))
    .filter(Boolean)
    .join("\n\n");
}

export function lspHoverExtension(
  getLspId: () => string,
  getFilePath: () => string,
): Extension {
  return hoverTooltip(async (view, pos) => {
    const lang = getLspId();
    const filePath = getFilePath();
    const serverId = await lspClient.ensureStarted(lang, filePath);
    if (!serverId) return null;

    const uri = `file://${filePath}`;
    const line = view.state.doc.lineAt(pos);
    const character = pos - line.from;

    let result: LspHoverResult | null = null;
    try {
      result = (await lspClient.request(serverId, "textDocument/hover", {
        textDocument: { uri },
        position: { line: line.number - 1, character },
      })) as LspHoverResult | null;
    } catch { return null; }

    const text = extractMarkdown(result?.contents);
    if (!text) return null;

    return {
      pos,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-lsp-hover";
        dom.style.cssText = "padding:8px 12px;max-width:520px;max-height:320px;overflow:auto;font-size:13px;line-height:1.6;";
        dom.innerHTML = DOMPurify.sanitize(marked.parse(text) as string);
        return { dom };
      },
    };
  }, { hoverTime: 300 });
}
